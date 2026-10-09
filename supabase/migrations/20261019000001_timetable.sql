-- Timetable: class schedule and calendar.
--
-- The Principal and the Admin Manager keep a draft timetable: weekly class slots (per course,
-- or per class/batch of a course) and calendar events (holidays, exam weeks, events).
-- Publishing copies the draft to the live timetable:
--   * the Principal publishes directly;
--   * the Admin Manager's publication waits for the Principal, who approves (the system then
--     publishes or updates the live timetable from that snapshot) or rejects it with a note.
-- Faculty see the live timetable of their own classes; students see their own (their courses,
-- and their class where a slot is for one class). Admins read everything.

create or replace function public.manages_timetable()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.app_role() in ('principal', 'admin_manager'), false);
$$;

-- Class schedule -----------------------------------------------------------------------------
-- No timetable has been entered yet; any rows are treated as published.
alter table public.timetable_slots
  add column batch_id uuid references public.course_batches (id) on delete cascade,
  add column state    text not null default 'draft' check (state in ('draft', 'live'));
update public.timetable_slots set state = 'live';
insert into public.timetable_slots (course_id, weekday, starts_at, ends_at, room, state)
  select course_id, weekday, starts_at, ends_at, room, 'draft' from public.timetable_slots where state = 'live';
create index timetable_slots_state_idx on public.timetable_slots (state, weekday, starts_at);
create index timetable_slots_batch_idx on public.timetable_slots (batch_id);

-- A room, a Faculty member, or a class can be in only one place at a time, within the draft
-- or within the live timetable.
create or replace function public.guard_timetable_slot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_clash record;
begin
  new.room := trim(new.room);
  if new.batch_id is not null
     and not exists (select 1 from public.course_batches where id = new.batch_id and course_id = new.course_id) then
    raise exception 'That class is not a batch of this course';
  end if;
  if tg_op = 'UPDATE' and new.state is distinct from old.state and not public.review_mode() then
    raise exception 'Publish the timetable to change what is live';
  end if;
  if tg_op = 'INSERT' and new.state = 'live' and auth.uid() is not null and not public.review_mode() then
    raise exception 'Publish the timetable to change what is live';
  end if;
  select c.title, s.room,
         (c.professor_id = me.professor_id) as same_faculty,
         (s.course_id = new.course_id and (s.batch_id is null or new.batch_id is null or s.batch_id = new.batch_id)) as same_class
    into v_clash
    from public.timetable_slots s
    join public.courses c on c.id = s.course_id
    join public.courses me on me.id = new.course_id
   where s.id <> new.id
     and s.state = new.state
     and s.weekday = new.weekday
     and s.starts_at < new.ends_at and s.ends_at > new.starts_at
     and c.status <> 'archived'
     and ((new.room <> '' and lower(s.room) = lower(new.room))
          or c.professor_id = me.professor_id
          or (s.course_id = new.course_id and (s.batch_id is null or new.batch_id is null or s.batch_id = new.batch_id)))
   limit 1;
  if found then
    if v_clash.same_class then
      raise exception 'This class already has % at that time', v_clash.title;
    end if;
    if v_clash.same_faculty then
      raise exception 'This Faculty member already teaches % at that time', v_clash.title;
    end if;
    raise exception 'Room % is already booked for % at that time', v_clash.room, v_clash.title;
  end if;
  return new;
end;
$$;

-- Is the caller a student of this slot: enrolled in the course and, for a class slot, in that class.
create or replace function public.in_timetable_class(p_course_id uuid, p_batch_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.app_role() = 'student' and exists (
    select 1 from public.enrollments e
     where e.course_id = p_course_id and e.student_id = auth.uid()
       and (p_batch_id is null or e.batch_id = p_batch_id)
  );
$$;

drop policy timetable_select on public.timetable_slots;
create policy timetable_select on public.timetable_slots for select to authenticated using (
  (select public.manages_timetable()) or (select public.is_overseer())
  or (state = 'live' and (public.is_professor_of(course_id) or public.in_timetable_class(course_id, batch_id)))
);
drop policy timetable_admin on public.timetable_slots;
create policy timetable_write on public.timetable_slots for all to authenticated
  using ((select public.manages_timetable()) and state = 'draft')
  with check ((select public.manages_timetable()) and state = 'draft');

-- Calendar ----------------------------------------------------------------------------------
create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) > 0),
  kind        text not null default 'event' check (kind in ('holiday', 'exam', 'event', 'term')),
  starts_on   date not null,
  ends_on     date not null,
  course_id   uuid references public.courses (id) on delete cascade,
  notes       text not null default '',
  state       text not null default 'draft' check (state in ('draft', 'live')),
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index calendar_events_state_idx on public.calendar_events (state, starts_on);
create index calendar_events_course_idx on public.calendar_events (course_id);

create or replace function public.guard_calendar_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.title := trim(new.title);
  new.notes := trim(new.notes);
  if not public.review_mode() and auth.uid() is not null
     and (new.state = 'live' or (tg_op = 'UPDATE' and old.state = 'live')) then
    raise exception 'Publish the timetable to change what is live';
  end if;
  return new;
end;
$$;
create trigger calendar_events_guard before insert or update on public.calendar_events
  for each row execute function public.guard_calendar_event();

alter table public.calendar_events enable row level security;
create policy calendar_events_select on public.calendar_events for select to authenticated using (
  (select public.manages_timetable()) or (select public.is_overseer())
  or (state = 'live' and (select public.is_active())
      and (course_id is null or public.is_professor_of(course_id) or public.in_timetable_class(course_id, null)))
);
create policy calendar_events_write on public.calendar_events for all to authenticated
  using ((select public.manages_timetable()) and state = 'draft')
  with check ((select public.manages_timetable()) and state = 'draft');

-- Publication ------------------------------------------------------------------------------
create table public.timetable_publications (
  id            uuid primary key default gen_random_uuid(),
  publication_no text not null unique,
  status        text not null check (status in ('pending', 'approved', 'rejected', 'published', 'withdrawn')),
  note          text not null default '',
  review_note   text not null default '',
  snapshot      jsonb not null,
  slot_count    integer not null,
  event_count   integer not null,
  requested_by  uuid references public.profiles (id) on delete set null,
  requested_at  timestamptz not null default now(),
  reviewed_by   uuid references public.profiles (id) on delete set null,
  reviewed_at   timestamptz
);
create index timetable_publications_status_idx on public.timetable_publications (status, requested_at desc);
create index timetable_publications_requested_by_idx on public.timetable_publications (requested_by);
create index timetable_publications_reviewed_by_idx on public.timetable_publications (reviewed_by);
create unique index timetable_publications_one_pending on public.timetable_publications ((true)) where status = 'pending';

alter table public.timetable_publications enable row level security;
create policy timetable_publications_select on public.timetable_publications for select to authenticated
  using ((select public.manages_timetable()) or (select public.is_overseer()));

create trigger audit_timetable_slots after insert or update or delete on public.timetable_slots
  for each row execute function public.audit_row();
create trigger audit_calendar_events after insert or update or delete on public.calendar_events
  for each row execute function public.audit_row();
create trigger audit_timetable_publications after insert or update on public.timetable_publications
  for each row execute function public.audit_row();

-- The draft as it stands.
create or replace function public.timetable_draft_snapshot()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'slots', coalesce((select jsonb_agg(jsonb_build_object('course_id', course_id, 'batch_id', batch_id, 'weekday', weekday,
                          'starts_at', starts_at, 'ends_at', ends_at, 'room', room) order by weekday, starts_at)
                         from public.timetable_slots where state = 'draft'), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('title', title, 'kind', kind, 'starts_on', starts_on, 'ends_on', ends_on,
                          'course_id', course_id, 'notes', notes) order by starts_on)
                         from public.calendar_events where state = 'draft'), '[]'::jsonb)
  );
$$;
revoke execute on function public.timetable_draft_snapshot() from public, anon, authenticated;

-- Replace the live timetable with a snapshot and tell Faculty and students.
create or replace function public.apply_timetable(p_snapshot jsonb, p_publication_no text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  perform set_config('bigsms.review', 'on', true);
  delete from public.timetable_slots where state = 'live';
  delete from public.calendar_events where state = 'live';
  insert into public.timetable_slots (course_id, batch_id, weekday, starts_at, ends_at, room, state)
    select (s ->> 'course_id')::uuid, (s ->> 'batch_id')::uuid, (s ->> 'weekday')::smallint,
           (s ->> 'starts_at')::time, (s ->> 'ends_at')::time, coalesce(s ->> 'room', ''), 'live'
      from jsonb_array_elements(p_snapshot -> 'slots') s
     where exists (select 1 from public.courses c where c.id = (s ->> 'course_id')::uuid);
  insert into public.calendar_events (title, kind, starts_on, ends_on, course_id, notes, state)
    select e ->> 'title', e ->> 'kind', (e ->> 'starts_on')::date, (e ->> 'ends_on')::date,
           (e ->> 'course_id')::uuid, coalesce(e ->> 'notes', ''), 'live'
      from jsonb_array_elements(p_snapshot -> 'events') e
     where e ->> 'course_id' is null or exists (select 1 from public.courses c where c.id = (e ->> 'course_id')::uuid);
  perform set_config('bigsms.review', 'off', true);

  for v_user in
    select distinct c.professor_id from public.timetable_slots s join public.courses c on c.id = s.course_id where s.state = 'live'
    union
    select distinct e.student_id from public.timetable_slots s
      join public.enrollments e on e.course_id = s.course_id and (s.batch_id is null or e.batch_id = s.batch_id)
     where s.state = 'live'
  loop
    perform public.notify(v_user, 'Timetable updated', 'The timetable has been published (' || p_publication_no || ').',
      case when (select role from public.profiles where id = v_user) = 'student' then '/student/timetable' else '/professor/timetable' end);
  end loop;
end;
$$;
revoke execute on function public.apply_timetable(jsonb, text) from public, anon, authenticated;

-- Publish the draft. The Principal's publication goes live at once; the Admin Manager's waits
-- for the Principal. Returns the new status.
create or replace function public.publish_timetable(p_note text default '')
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot jsonb := public.timetable_draft_snapshot();
  v_no text;
  v_principal uuid;
  v_role public.user_role := public.app_role();
begin
  if v_role is null or v_role not in ('principal', 'admin_manager') then
    raise exception 'Only the Principal or the Admin Manager can publish the timetable';
  end if;
  if exists (select 1 from public.timetable_publications where status = 'pending') then
    raise exception 'A timetable is already awaiting the Principal''s approval';
  end if;
  v_no := public.next_document_no('TT');
  insert into public.timetable_publications (publication_no, status, note, snapshot, slot_count, event_count, requested_by,
                                             reviewed_by, reviewed_at)
  values (v_no, case when v_role = 'principal' then 'published' else 'pending' end, trim(coalesce(p_note, '')), v_snapshot,
          jsonb_array_length(v_snapshot -> 'slots'), jsonb_array_length(v_snapshot -> 'events'), auth.uid(),
          case when v_role = 'principal' then auth.uid() end, case when v_role = 'principal' then now() end);

  if v_role = 'principal' then
    perform public.apply_timetable(v_snapshot, v_no);
    return 'published';
  end if;
  for v_principal in select id from public.profiles where role = 'principal' and status = 'active' loop
    perform public.notify(v_principal, 'Timetable awaiting your approval', v_no || ' from the Admin Manager', '/timetable?tab=publish');
  end loop;
  return 'pending';
end;
$$;
revoke execute on function public.publish_timetable(text) from public, anon;
grant execute on function public.publish_timetable(text) to authenticated;

-- The Principal approves (publishes) or rejects the Admin Manager's publication. The requester
-- may withdraw it while it is pending.
create or replace function public.review_timetable(p_publication_id uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_pub public.timetable_publications;
  v_note text := trim(coalesce(p_note, ''));
begin
  select * into v_pub from public.timetable_publications where id = p_publication_id for update;
  if not found or v_pub.status <> 'pending' then
    raise exception 'This timetable is not awaiting approval';
  end if;
  if p_decision = 'withdraw' then
    if v_pub.requested_by is distinct from auth.uid() then
      raise exception 'Only the person who submitted it can withdraw it';
    end if;
    update public.timetable_publications set status = 'withdrawn', reviewed_at = now() where id = v_pub.id;
    return;
  end if;
  if coalesce(public.app_role() <> 'principal', true) then
    raise exception 'Only the Principal approves the timetable';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Approve or reject the timetable';
  end if;
  if p_decision = 'reject' and v_note = '' then
    raise exception 'Give a reason for rejecting it';
  end if;
  update public.timetable_publications
     set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         review_note = v_note, reviewed_by = auth.uid(), reviewed_at = now()
   where id = v_pub.id;
  if p_decision = 'approve' then
    perform public.apply_timetable(v_pub.snapshot, v_pub.publication_no);
    perform public.notify(v_pub.requested_by, 'Timetable approved', v_pub.publication_no || ' is published', '/timetable?tab=publish');
  else
    perform public.notify(v_pub.requested_by, 'Timetable rejected', v_pub.publication_no || ': ' || v_note, '/timetable?tab=publish');
  end if;
end;
$$;
revoke execute on function public.review_timetable(uuid, text, text) from public, anon;
grant execute on function public.review_timetable(uuid, text, text) to authenticated;
