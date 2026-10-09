-- Course management.
--
-- Course information: Course Name (title), Course ID (code), Course Duration, Course Outline,
-- Course Curriculum, Course Faculty (professor_id) and Course Fee.
--
-- Stages: Draft -> Publish -> Edit -> Archive.
--   Draft      being prepared; students cannot see it.
--   Published  live to enrolled students.
--   Edit       a published course with unpublished changes. Students keep seeing the
--              published version until the changes are published. Stored as
--              status = 'published' and editing = true, with the changes in course_edits
--              (which students cannot read), so every existing "published" check keeps working.
--   Archived   withdrawn; students lose access. Can be restored to Draft.
--
-- Principal, Admin Manager and Faculty create and edit courses (Faculty only their own, and
-- they cannot reassign the course faculty). Only the Principal or the Admin Manager publish,
-- archive or restore. Faculty mark a draft or edit ready, which notifies them.
-- Admins and Super Admins read courses but no longer change them.
--
-- This replaces the earlier approval chain (submit -> pending approval -> approve/reject, with
-- configurable approval steps). Pending courses become drafts marked ready; rejected courses
-- become drafts. The course_approvals history is kept, read-only.

-- Who manages courses ---------------------------------------------------------------------
create or replace function public.manages_courses()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('principal', 'admin_manager'), false);
$$;

-- Old workflow out ------------------------------------------------------------------------
drop trigger if exists courses_notify on public.courses;
drop trigger if exists courses_guard on public.courses;
drop function if exists public.notify_course_status();
drop function if exists public.review_course(uuid, text, text);
drop function if exists public.set_approval_workflow(text, public.user_role[]);
drop function if exists public.notify_step_approvers(public.courses);
drop function if exists public.guard_course_update();
drop table if exists public.approval_steps;
alter table public.courses drop column if exists approval_step;

-- Course information ----------------------------------------------------------------------
alter table public.courses
  add column code            text,
  add column duration_value  integer check (duration_value > 0),
  add column duration_unit   text not null default 'weeks' check (duration_unit in ('days', 'weeks', 'months', 'years')),
  add column curriculum      text not null default '',
  add column fee             numeric(12, 2) check (fee >= 0),
  add column editing         boolean not null default false,
  add column ready_at        timestamptz,
  add column ready_by        uuid references public.profiles (id) on delete set null,
  add column published_at    timestamptz,
  add column published_by    uuid references public.profiles (id) on delete set null,
  add column created_by      uuid references public.profiles (id) on delete set null;

comment on column public.courses.code is 'Course ID shown to people, e.g. CS-101. Generated as CRS-0001 when left blank.';
comment on column public.courses.editing is 'A published course with changes waiting in course_edits (the Edit stage).';
comment on column public.courses.ready_at is 'When Faculty marked the draft or edit ready for the Principal / Admin Manager to publish.';

-- CRS-0001, CRS-0002, ... (not reset yearly, unlike invoice numbers).
create or replace function public.next_course_code()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
  v_code text;
begin
  loop
    insert into public.document_counters as c (prefix, last_value) values ('CRS', 1)
    on conflict (prefix) do update set last_value = c.last_value + 1
    returning last_value into v_n;
    v_code := 'CRS-' || lpad(v_n::text, 4, '0');
    exit when not exists (select 1 from public.courses where upper(code) = v_code);
  end loop;
  return v_code;
end;
$$;
revoke execute on function public.next_course_code() from public, anon, authenticated;

-- Existing courses: codes, publish dates, and the old states mapped onto the new stages.
do $$
declare
  r record;
begin
  for r in select id from public.courses order by created_at, id loop
    update public.courses set code = public.next_course_code() where id = r.id;
  end loop;
end;
$$;
update public.courses
   set published_at = coalesce(reviewed_at, updated_at), published_by = reviewed_by
 where status = 'published';
update public.courses set status = 'draft', ready_at = updated_at where status = 'pending_approval';
update public.courses set status = 'draft' where status = 'rejected';
update public.courses set created_by = professor_id where created_by is null;

alter table public.courses alter column code set not null;
create unique index courses_code_key on public.courses (upper(code));
alter table public.courses
  add constraint courses_status_stage check (status in ('draft', 'published', 'archived'));
create index courses_ready_idx on public.courses (ready_at) where ready_at is not null;

-- The editable course information, as stored in course_edits.changes.
create or replace function public.course_info(c public.courses)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'title', c.title, 'code', c.code, 'description', c.description, 'outline', c.outline,
    'curriculum', c.curriculum, 'duration_value', c.duration_value, 'duration_unit', c.duration_unit,
    'fee', c.fee, 'category_id', c.category_id, 'professor_id', c.professor_id
  );
$$;

-- Unpublished changes to a published course. Written only by the guard trigger and the
-- workflow functions; readable by whoever may edit or oversee the course, never by students.
create table public.course_edits (
  course_id   uuid primary key references public.courses (id) on delete cascade,
  changes     jsonb not null,
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.course_edits enable row level security;
create policy course_edits_select on public.course_edits for select to authenticated using (
  (select public.manages_courses()) or (select public.is_overseer()) or public.is_professor_of(course_id)
);
create trigger audit_course_edits after insert or update or delete on public.course_edits
  for each row execute function public.audit_row();

-- Checks that apply to every version of the course information.
create or replace function public.check_course_info(c public.courses)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if nullif(trim(c.title), '') is null then
    raise exception 'Enter the course name';
  end if;
  if c.code !~ '^[A-Z0-9][A-Z0-9 ._/-]{0,29}$' then
    raise exception 'Course ID can use letters, numbers, spaces and . _ / - (up to 30 characters)';
  end if;
  if exists (select 1 from public.courses where upper(code) = c.code and id <> c.id) then
    raise exception 'Course ID % is already used by another course', c.code;
  end if;
  if not exists (select 1 from public.profiles where id = c.professor_id and role = 'professor') then
    raise exception 'Course faculty must be a Faculty member';
  end if;
end;
$$;
revoke execute on function public.check_course_info(public.courses) from public, anon, authenticated;

-- Course guard:
--   status, ready and publish fields change only inside the workflow functions below
--     (bigsms.review = on), never by a direct update
--   archived courses are read-only until restored
--   Faculty cannot change the course faculty
--   edits to a published course are held in course_edits (the Edit stage) and the live
--     columns are left as they were; editing back to the live values clears the edit
-- Requests without a user (SQL editor, service role, seeding) are not restricted.
create or replace function public.guard_course()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_edit jsonb;
  v_live jsonb;
begin
  new.code := nullif(upper(trim(coalesce(new.code, ''))), '');

  if tg_op = 'INSERT' then
    if new.code is null then
      new.code := public.next_course_code();
    end if;
    if auth.uid() is not null then
      new.status := 'draft';
      new.editing := false;
      new.ready_at := null;
      new.ready_by := null;
      new.published_at := null;
      new.published_by := null;
      new.created_by := auth.uid();
    end if;
    perform public.check_course_info(new);
    return new;
  end if;

  if auth.uid() is null or coalesce(current_setting('bigsms.review', true), '') = 'on' then
    return new;
  end if;

  if new.status is distinct from old.status
     or new.editing is distinct from old.editing
     or new.ready_at is distinct from old.ready_at
     or new.ready_by is distinct from old.ready_by
     or new.published_at is distinct from old.published_at
     or new.published_by is distinct from old.published_by
     or new.created_by is distinct from old.created_by
     or new.reviewed_by is distinct from old.reviewed_by
     or new.reviewed_at is distinct from old.reviewed_at
     or new.review_note is distinct from old.review_note then
    raise exception 'Use Publish, Archive or Restore to change a course''s stage';
  end if;
  if old.status = 'archived' then
    raise exception 'Restore this course before editing it';
  end if;
  if new.professor_id is distinct from old.professor_id and not public.manages_courses() then
    raise exception 'Only the Principal or Admin Manager can change the course faculty';
  end if;
  new.code := coalesce(new.code, old.code);
  perform public.check_course_info(new);

  if old.status = 'published' then
    v_edit := public.course_info(new);
    v_live := public.course_info(old);
    if v_edit = v_live then
      delete from public.course_edits where course_id = old.id;
      new.editing := false;
      new.ready_at := null;
      new.ready_by := null;
    else
      insert into public.course_edits (course_id, changes, updated_by) values (old.id, v_edit, auth.uid())
      on conflict (course_id) do update
        set changes = excluded.changes, updated_by = excluded.updated_by, updated_at = now();
      new.editing := true;
    end if;
    new := jsonb_populate_record(new, v_live);
  end if;
  return new;
end;
$$;
create trigger courses_guard before insert or update on public.courses
  for each row execute function public.guard_course();

-- Access ----------------------------------------------------------------------------------
-- Reading is unchanged: Admins, the Principal and the Admin Manager see every course, Faculty
-- their own, students the published courses they are enrolled in.
drop policy courses_insert on public.courses;
create policy courses_insert on public.courses for insert to authenticated with check (
  status = 'draft' and (
    (select public.manages_courses())
    or ((select public.app_role()) = 'professor' and professor_id = (select auth.uid()))
  )
);
drop policy courses_update on public.courses;
create policy courses_update on public.courses for update to authenticated
  using ((select public.manages_courses()) or public.is_professor_of(id))
  with check ((select public.manages_courses()) or professor_id = (select auth.uid()));
-- Only drafts that were never published can be deleted; anything else is archived.
drop policy courses_delete on public.courses;
create policy courses_delete on public.courses for delete to authenticated using (
  status = 'draft' and published_at is null
  and ((select public.manages_courses()) or public.is_professor_of(id))
);

-- Workflow --------------------------------------------------------------------------------
create or replace function public.notify_course_managers(p_title text, p_body text, p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  for v_user in
    select id from public.profiles
     where role in ('principal', 'admin_manager') and status = 'active' and id is distinct from auth.uid()
  loop
    perform public.notify(v_user, p_title, p_body, '/courses/' || p_course_id);
  end loop;
end;
$$;
revoke execute on function public.notify_course_managers(text, text, uuid) from public, anon, authenticated;

-- Faculty (or a manager) marks a draft or an edit ready to publish, or takes the mark back.
create or replace function public.set_course_ready(p_course_id uuid, p_ready boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if not found or not (public.manages_courses() or public.is_professor_of(p_course_id)) then
    raise exception 'Course not found';
  end if;
  if not (v_course.status = 'draft' or (v_course.status = 'published' and v_course.editing)) then
    raise exception 'Only a draft or a course with unpublished changes can be marked ready';
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.courses
     set ready_at = case when p_ready then now() end,
         ready_by = case when p_ready then auth.uid() end
   where id = p_course_id;
  perform set_config('bigsms.review', 'off', true);

  if p_ready then
    perform public.notify_course_managers(
      case when v_course.status = 'draft' then 'Course ready to publish' else 'Course changes ready to publish' end,
      v_course.code || ' ' || v_course.title, p_course_id);
  end if;
end;
$$;

-- Publish a draft, or publish the pending changes of a course in the Edit stage.
-- Every field except the description and category is required to publish.
create or replace function public.publish_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
  v_changes jsonb;
  v_was_edit boolean;
begin
  if not public.manages_courses() then
    raise exception 'Only the Principal or Admin Manager can publish courses';
  end if;
  select * into v_course from public.courses where id = p_course_id for update;
  if not found then
    raise exception 'Course not found';
  end if;
  v_was_edit := v_course.status = 'published';
  if v_course.status = 'archived' then
    raise exception 'Restore this course before publishing it';
  end if;
  select changes into v_changes from public.course_edits where course_id = p_course_id;
  if v_was_edit and v_changes is null then
    raise exception 'This course is already published and has no changes to publish';
  end if;

  if v_changes is not null then
    v_course := jsonb_populate_record(v_course, v_changes);
  end if;
  perform public.check_course_info(v_course);
  if v_course.duration_value is null then
    raise exception 'Enter the course duration before publishing';
  end if;
  if v_course.fee is null then
    raise exception 'Enter the course fee before publishing (0 for a free course)';
  end if;
  if nullif(trim(v_course.outline), '') is null then
    raise exception 'Enter the course outline before publishing';
  end if;
  if nullif(trim(v_course.curriculum), '') is null then
    raise exception 'Enter the course curriculum before publishing';
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.courses
     set title = v_course.title, code = v_course.code, description = v_course.description,
         outline = v_course.outline, curriculum = v_course.curriculum,
         duration_value = v_course.duration_value, duration_unit = v_course.duration_unit,
         fee = v_course.fee, category_id = v_course.category_id, professor_id = v_course.professor_id,
         status = 'published', editing = false, ready_at = null, ready_by = null,
         published_at = now(), published_by = auth.uid()
   where id = p_course_id;
  delete from public.course_edits where course_id = p_course_id;
  perform set_config('bigsms.review', 'off', true);

  perform public.notify(v_course.professor_id,
    case when v_was_edit then 'Course changes published' else 'Course published' end,
    v_course.code || ' ' || v_course.title || case when v_was_edit then ': the changes are now live.' else ' is now live to enrolled students.' end,
    '/professor/courses/' || p_course_id);
  perform public.notify_course_managers(
    case when v_was_edit then 'Course changes published' else 'Course published' end,
    v_course.code || ' ' || v_course.title, p_course_id);
end;
$$;

-- Throw away the pending changes of a course in the Edit stage.
create or replace function public.discard_course_changes(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.courses where id = p_course_id)
     or not (public.manages_courses() or public.is_professor_of(p_course_id)) then
    raise exception 'Course not found';
  end if;
  if not exists (select 1 from public.courses where id = p_course_id and status = 'published' and editing) then
    raise exception 'This course has no unpublished changes';
  end if;
  perform set_config('bigsms.review', 'on', true);
  update public.courses set editing = false, ready_at = null, ready_by = null where id = p_course_id;
  delete from public.course_edits where course_id = p_course_id;
  perform set_config('bigsms.review', 'off', true);
end;
$$;

-- Archive a course at any stage. Unpublished changes are kept for when it is restored.
create or replace function public.archive_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
begin
  if not public.manages_courses() then
    raise exception 'Only the Principal or Admin Manager can archive courses';
  end if;
  select * into v_course from public.courses where id = p_course_id for update;
  if not found then
    raise exception 'Course not found';
  end if;
  if v_course.status = 'archived' then
    raise exception 'This course is already archived';
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.courses set status = 'archived', ready_at = null, ready_by = null where id = p_course_id;
  perform set_config('bigsms.review', 'off', true);

  perform public.notify(v_course.professor_id, 'Course archived',
    v_course.code || ' ' || v_course.title || ' has been archived. Students no longer see it.',
    '/professor/courses/' || p_course_id);
end;
$$;

-- Restore an archived course to Draft, with any unpublished changes applied.
create or replace function public.restore_course(p_course_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_course public.courses;
  v_changes jsonb;
begin
  if not public.manages_courses() then
    raise exception 'Only the Principal or Admin Manager can restore courses';
  end if;
  select * into v_course from public.courses where id = p_course_id for update;
  if not found then
    raise exception 'Course not found';
  end if;
  if v_course.status <> 'archived' then
    raise exception 'Only archived courses can be restored';
  end if;
  select changes into v_changes from public.course_edits where course_id = p_course_id;
  if v_changes is not null then
    v_course := jsonb_populate_record(v_course, v_changes);
    perform public.check_course_info(v_course);
  end if;

  perform set_config('bigsms.review', 'on', true);
  update public.courses
     set title = v_course.title, code = v_course.code, description = v_course.description,
         outline = v_course.outline, curriculum = v_course.curriculum,
         duration_value = v_course.duration_value, duration_unit = v_course.duration_unit,
         fee = v_course.fee, category_id = v_course.category_id, professor_id = v_course.professor_id,
         status = 'draft', editing = false
   where id = p_course_id;
  delete from public.course_edits where course_id = p_course_id;
  perform set_config('bigsms.review', 'off', true);

  perform public.notify(v_course.professor_id, 'Course restored',
    v_course.code || ' ' || v_course.title || ' is back in Draft.', '/professor/courses/' || p_course_id);
end;
$$;

-- A newly assigned faculty member hears about it.
create or replace function public.notify_course_faculty()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.professor_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.professor_id is distinct from old.professor_id) then
    perform public.notify(new.professor_id, 'Course assigned to you', new.code || ' ' || new.title,
      '/professor/courses/' || new.id);
  end if;
  return new;
end;
$$;
create trigger courses_notify_faculty after insert or update of professor_id on public.courses
  for each row execute function public.notify_course_faculty();

revoke execute on function public.set_course_ready(uuid, boolean) from public, anon;
revoke execute on function public.publish_course(uuid) from public, anon;
revoke execute on function public.discard_course_changes(uuid) from public, anon;
revoke execute on function public.archive_course(uuid) from public, anon;
revoke execute on function public.restore_course(uuid) from public, anon;
grant execute on function public.set_course_ready(uuid, boolean) to authenticated;
grant execute on function public.publish_course(uuid) to authenticated;
grant execute on function public.discard_course_changes(uuid) to authenticated;
grant execute on function public.archive_course(uuid) to authenticated;
grant execute on function public.restore_course(uuid) to authenticated;
