-- Reference data (no users). Run after migrations: `supabase db reset` runs it automatically,
-- or paste into the SQL editor. Demo users and course content come from `npm run seed`.

insert into public.course_categories (name) values
  ('Computer Science'), ('Mathematics'), ('Physics'), ('Business'), ('Languages')
on conflict (name) do nothing;

insert into public.kpi_definitions (name, metric, comparison, threshold) values
  ('Low lecture completion', 'completion_rate', 'below', 40),
  ('Low quiz performance', 'avg_quiz_score', 'below', 50),
  ('Low assignment submission', 'submission_rate', 'below', 60);

insert into public.system_settings (key, value) values
  ('institution_name', '"Zicon Academy"'),
  ('academic_year', '"2026-2027"'),
  ('max_upload_mb', '50'),
  ('support_email', '"support@example.com"')
on conflict (key) do nothing;
