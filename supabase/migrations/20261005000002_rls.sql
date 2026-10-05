-- BigSMS LMS: Row Level Security policies.
-- Inactive/pending accounts match no policy except reading their own profile.

alter table public.profiles          enable row level security;
alter table public.parent_students   enable row level security;
alter table public.course_categories enable row level security;
alter table public.courses           enable row level security;
alter table public.enrollments       enable row level security;
alter table public.lectures          enable row level security;
alter table public.materials         enable row level security;
alter table public.lecture_progress  enable row level security;
alter table public.assignments       enable row level security;
alter table public.submissions       enable row level security;
alter table public.questions         enable row level security;
alter table public.quizzes           enable row level security;
alter table public.quiz_questions    enable row level security;
alter table public.quiz_attempts     enable row level security;
alter table public.notifications     enable row level security;
alter table public.kpi_definitions   enable row level security;
alter table public.alerts            enable row level security;
alter table public.system_settings   enable row level security;
alter table public.audit_logs        enable row level security;

-- Profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (select public.is_admin())
  or ((select public.app_role()) = 'professor' and role = 'student')
  or ((select public.is_active()) and role = 'professor')
  or public.is_parent_of(id)
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_delete on public.profiles for delete to authenticated
  using ((select public.is_admin()));

-- Parent links --------------------------------------------------------------
create policy parent_students_select on public.parent_students for select to authenticated using (
  (select public.is_admin())
  or (parent_id = (select auth.uid()) and (select public.is_active()))
);
create policy parent_students_admin on public.parent_students for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Categories ----------------------------------------------------------------
create policy categories_select on public.course_categories for select to authenticated
  using ((select public.is_active()));
create policy categories_admin on public.course_categories for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Courses -------------------------------------------------------------------
create policy courses_select on public.courses for select to authenticated
  using (public.can_view_course(id));
create policy courses_insert on public.courses for insert to authenticated with check (
  (select public.app_role()) = 'professor' and professor_id = (select auth.uid()) and status = 'draft'
);
create policy courses_update on public.courses for update to authenticated
  using ((select public.is_admin()) or public.is_professor_of(id))
  with check ((select public.is_admin()) or professor_id = (select auth.uid()));
create policy courses_delete on public.courses for delete to authenticated using (
  (select public.is_admin()) or (public.is_professor_of(id) and status = 'draft')
);

-- Enrollments ---------------------------------------------------------------
create policy enrollments_select on public.enrollments for select to authenticated using (
  (select public.is_admin())
  or public.is_professor_of(course_id)
  or (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
);
create policy enrollments_insert on public.enrollments for insert to authenticated with check (
  ((select public.is_admin()) or public.is_professor_of(course_id))
  and exists (select 1 from public.profiles p where p.id = student_id and p.role = 'student')
);
create policy enrollments_delete on public.enrollments for delete to authenticated using (
  (select public.is_admin()) or public.is_professor_of(course_id)
);

-- Lectures and materials ----------------------------------------------------
create policy lectures_select on public.lectures for select to authenticated
  using (public.can_view_course(course_id));
create policy lectures_manage on public.lectures for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

create policy materials_select on public.materials for select to authenticated
  using (public.can_view_course_content(course_id));
create policy materials_manage on public.materials for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

-- Lecture progress ----------------------------------------------------------
create policy progress_select on public.lecture_progress for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(course_id)
  or (select public.is_admin())
);
create policy progress_insert on public.lecture_progress for insert to authenticated with check (
  student_id = (select auth.uid()) and public.is_enrolled(course_id)
);
create policy progress_delete on public.lecture_progress for delete to authenticated using (
  student_id = (select auth.uid()) and public.is_enrolled(course_id)
);

-- Assignments and submissions -----------------------------------------------
create policy assignments_select on public.assignments for select to authenticated using (
  (select public.is_admin())
  or public.is_professor_of(course_id)
  or (published and (public.is_enrolled(course_id) or public.parent_sees_course(course_id)))
);
create policy assignments_manage on public.assignments for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

create policy submissions_select on public.submissions for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(public.assignment_course(assignment_id))
  or (select public.is_admin())
);
create policy submissions_insert on public.submissions for insert to authenticated with check (
  student_id = (select auth.uid())
  and public.is_enrolled(public.assignment_course(assignment_id))
  and exists (select 1 from public.assignments a where a.id = assignment_id and a.published)
);
create policy submissions_update on public.submissions for update to authenticated
  using (
    (student_id = (select auth.uid()) and public.is_enrolled(public.assignment_course(assignment_id)))
    or public.is_professor_of(public.assignment_course(assignment_id))
    or (select public.is_admin())
  )
  with check (
    (student_id = (select auth.uid()) and public.is_enrolled(public.assignment_course(assignment_id)))
    or public.is_professor_of(public.assignment_course(assignment_id))
    or (select public.is_admin())
  );

-- Question bank (answers never exposed to students/parents) -----------------
create policy questions_select on public.questions for select to authenticated using (
  (select public.app_role()) in ('admin', 'professor')
);
create policy questions_insert on public.questions for insert to authenticated with check (
  (select public.app_role()) in ('admin', 'professor') and created_by = (select auth.uid())
);
create policy questions_update on public.questions for update to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and (select public.app_role()) = 'professor'))
  with check ((select public.is_admin()) or created_by = (select auth.uid()));
create policy questions_delete on public.questions for delete to authenticated
  using ((select public.is_admin()) or (created_by = (select auth.uid()) and (select public.app_role()) = 'professor'));

-- Quizzes -------------------------------------------------------------------
create policy quizzes_select on public.quizzes for select to authenticated using (
  (select public.is_admin())
  or public.is_professor_of(course_id)
  or (published and (public.is_enrolled(course_id) or public.parent_sees_course(course_id)))
);
create policy quizzes_manage on public.quizzes for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id))
  with check ((select public.is_admin()) or public.is_professor_of(course_id));

create policy quiz_questions_manage on public.quiz_questions for all to authenticated
  using ((select public.is_admin()) or public.is_professor_of(public.quiz_course(quiz_id)))
  with check ((select public.is_admin()) or public.is_professor_of(public.quiz_course(quiz_id)));

-- Attempts are written only through submit_quiz().
create policy quiz_attempts_select on public.quiz_attempts for select to authenticated using (
  (student_id = (select auth.uid()) and (select public.is_active()))
  or public.is_parent_of(student_id)
  or public.is_professor_of(public.quiz_course(quiz_id))
  or (select public.is_admin())
);

-- Notifications -------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- KPIs and alerts -----------------------------------------------------------
create policy kpis_select on public.kpi_definitions for select to authenticated
  using ((select public.app_role()) in ('admin', 'professor'));
create policy kpis_admin on public.kpi_definitions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy alerts_select on public.alerts for select to authenticated
  using ((select public.is_admin()) or public.is_professor_of(course_id));
create policy alerts_admin on public.alerts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Settings and audit --------------------------------------------------------
create policy settings_select on public.system_settings for select to authenticated
  using ((select public.is_active()));
create policy settings_admin on public.system_settings for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy audit_select on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- Storage: course materials live at course-materials/<course_id>/<file> -----
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', false)
on conflict (id) do nothing;

create policy materials_read on storage.objects for select to authenticated using (
  bucket_id = 'course-materials'
  and public.can_view_course_content(public.try_uuid((storage.foldername(name))[1]))
);
create policy materials_write on storage.objects for insert to authenticated with check (
  bucket_id = 'course-materials'
  and ((select public.is_admin()) or public.is_professor_of(public.try_uuid((storage.foldername(name))[1])))
);
create policy materials_modify on storage.objects for update to authenticated using (
  bucket_id = 'course-materials'
  and ((select public.is_admin()) or public.is_professor_of(public.try_uuid((storage.foldername(name))[1])))
);
create policy materials_remove on storage.objects for delete to authenticated using (
  bucket_id = 'course-materials'
  and ((select public.is_admin()) or public.is_professor_of(public.try_uuid((storage.foldername(name))[1])))
);
