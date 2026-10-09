-- Demo data for every module and dashboard. Run after demo_seed.sql:
--   supabase db query --db-url "<connection string>" -f supabase/demo_seed_modules.sql
-- One statement, all or nothing. Skips itself if it has already run (student12@bigsms.demo exists).
-- New demo accounts use the password Demo@12345. Dates run from June 2026 to today so the
-- historic analytics have months to show.

do $$
declare
  pw constant text := 'Demo@12345';
  u record; r record; s record; e record; c record;
  v_id uuid;
  p_super uuid; p_admin uuid; p_manager uuid; p_principal uuid;
  f_omar uuid; f_lina uuid; f_ahmed uuid;
  s_sara uuid; s_bilal uuid; s_zara uuid;
  c_prog uuid; c_web uuid; c_stats uuid; c_lin uuid; c_db uuid; c_comm uuid; cat_cs uuid; cat_bus uuid;
  b_prog_a uuid; b_prog_b uuid; b_stats uuid; b_db uuid;
  v_session uuid; v_assign uuid; v_exam uuid; v_inv uuid; v_list uuid; v_cert uuid; v_pub_snapshot jsonb;
  v_h int; v_day date; v_due timestamptz; v_sub timestamptz; v_pct numeric; v_bal numeric;
begin
  if exists (select 1 from auth.users where email = 'student12@bigsms.demo') then
    raise notice 'Module demo data is already present';
    return;
  end if;
  -- Workflow states are written directly (as the workflow functions would leave them).
  perform set_config('bigsms.review', 'on', true);

  -- People ------------------------------------------------------------------------------
  for u in
    select * from (values
      ('professor3@bigsms.demo', 'Dr. Ahmed Raza',  'professor', 'Computer Science', '0300-1112233'),
      ('staff@bigsms.demo',      'Kamran Ali',      'staff',     'Accounts',         '0301-2223344'),
      ('staff2@bigsms.demo',     'Nadia Iqbal',     'staff',     'Library',          '0302-3334455'),
      ('parent2@bigsms.demo',    'Tariq Ahmed',     'parent',    '',                 '0303-4445566'),
      ('student4@bigsms.demo',   'Ali Hassan',      'student',   '',                 '0310-1000004'),
      ('student5@bigsms.demo',   'Fatima Noor',     'student',   '',                 '0310-1000005'),
      ('student6@bigsms.demo',   'Usman Ghani',     'student',   '',                 '0310-1000006'),
      ('student7@bigsms.demo',   'Ayesha Siddiqa',  'student',   '',                 '0310-1000007'),
      ('student8@bigsms.demo',   'Hamza Sheikh',    'student',   '',                 '0310-1000008'),
      ('student9@bigsms.demo',   'Mariam Javed',    'student',   '',                 '0310-1000009'),
      ('student10@bigsms.demo',  'Omar Farooq',     'student',   '',                 '0310-1000010'),
      ('student11@bigsms.demo',  'Hira Aslam',      'student',   '',                 '0310-1000011'),
      ('student12@bigsms.demo',  'Saad Qureshi',    'student',   '',                 '0310-1000012')
    ) as t(email, full_name, role, department, phone)
  loop
    v_id := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
            extensions.crypt(pw, extensions.gen_salt('bf')), now(),
            '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name),
            '2026-05-15', now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text,
            jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now());
    update public.profiles
       set full_name = u.full_name, role = u.role::public.user_role, status = 'active', department = u.department, phone = u.phone
     where id = v_id;
  end loop;

  select id into p_super     from public.profiles where email = 'superadmin@bigsms.demo';
  select id into p_admin     from public.profiles where email = 'admin@bigsms.demo';
  select id into p_manager   from public.profiles where email = 'manager@bigsms.demo';
  select id into p_principal from public.profiles where email = 'principal@bigsms.demo';
  select id into f_omar      from public.profiles where email = 'professor@bigsms.demo';
  select id into f_lina      from public.profiles where email = 'professor2@bigsms.demo';
  select id into f_ahmed     from public.profiles where email = 'professor3@bigsms.demo';
  select id into s_sara      from public.profiles where email = 'student@bigsms.demo';
  select id into s_bilal     from public.profiles where email = 'student2@bigsms.demo';
  select id into s_zara      from public.profiles where email = 'student3@bigsms.demo';

  update public.profiles set department = 'Computer Science' where id = f_omar and department = '';
  update public.profiles set department = 'Mathematics' where id = f_lina and department = '';
  update public.profiles set department = 'Administration' where id in (p_super, p_admin, p_manager, p_principal) and department = '';

  insert into public.parent_students (parent_id, student_id)
  select (select id from public.profiles where email = 'parent2@bigsms.demo'), id
    from public.profiles where email in ('student2@bigsms.demo', 'student3@bigsms.demo')
  on conflict do nothing;

  -- Courses -----------------------------------------------------------------------------
  select id into c_prog  from public.courses where title = 'Introduction to Programming';
  select id into c_web   from public.courses where title = 'Web Development Basics';
  select id into c_stats from public.courses where title = 'Statistics 101';
  select id into c_lin   from public.courses where title = 'Linear Algebra';
  select id into cat_cs  from public.course_categories where name = 'Computer Science';
  select id into cat_bus from public.course_categories where name = 'Business';

  update public.courses set fee = 25000, duration_value = 16, duration_unit = 'weeks' where id = c_prog and fee is null;
  update public.courses set fee = 20000, duration_value = 12, duration_unit = 'weeks' where id = c_web and fee is null;
  update public.courses set fee = 22000, duration_value = 14, duration_unit = 'weeks' where id = c_stats and fee is null;
  update public.courses set fee = 18000, duration_value = 12, duration_unit = 'weeks' where id = c_lin and fee is null;

  insert into public.courses (professor_id, category_id, title, code, description, outline, curriculum, status, fee,
                              duration_value, duration_unit, published_at, published_by, created_by, created_at)
  values (f_ahmed, cat_cs, 'Database Systems', 'CRS-0006',
          'Relational modelling, SQL and transactions with PostgreSQL.',
          E'Week 1-2: The relational model\nWeek 3-5: SQL\nWeek 6-7: Normalisation\nWeek 8-10: Transactions and indexing',
          'Entity-relationship modelling, SQL queries and joins, normal forms, ACID transactions, indexes.',
          'published', 24000, 14, 'weeks', '2026-05-28', p_principal, p_manager, '2026-05-20')
  returning id into c_db;
  insert into public.courses (professor_id, category_id, title, code, description, outline, curriculum, status, fee,
                              duration_value, duration_unit, published_at, published_by, created_by, created_at)
  values (f_ahmed, cat_bus, 'Business Communication', 'CRS-0007',
          'Professional writing, presentations and meetings.',
          E'Week 1-3: Business writing\nWeek 4-6: Presentations\nWeek 7-8: Meetings and negotiation',
          'Emails, reports and proposals; slide design and delivery; running meetings.',
          'published', 15000, 8, 'weeks', '2026-05-29', p_manager, p_manager, '2026-05-21')
  returning id into c_comm;

  insert into public.lectures (course_id, position, title, content) values
    (c_db, 1, 'The relational model', 'Tables, keys and relationships.'),
    (c_db, 2, 'SQL basics', 'SELECT, WHERE, ORDER BY and aggregates.'),
    (c_db, 3, 'Joins', 'Inner, outer and self joins.'),
    (c_db, 4, 'Normalisation', 'First to third normal form.'),
    (c_comm, 1, 'Writing clear emails', 'Purpose, structure and tone.'),
    (c_comm, 2, 'Reports and proposals', 'Planning and structuring longer documents.'),
    (c_comm, 3, 'Presenting with confidence', 'Slides, delivery and questions.');

  -- Classes (batches) ---------------------------------------------------------------------
  insert into public.course_batches (course_id, name, starts_on, ends_on, capacity, status, created_by)
  values (c_prog, 'Morning A', '2026-06-01', '2026-11-30', 25, 'open', p_manager) returning id into b_prog_a;
  insert into public.course_batches (course_id, name, starts_on, ends_on, capacity, status, created_by)
  values (c_prog, 'Evening B', '2026-06-01', '2026-11-30', 25, 'open', p_manager) returning id into b_prog_b;
  insert into public.course_batches (course_id, name, starts_on, ends_on, capacity, status, created_by)
  values (c_stats, 'Section 1', '2026-06-01', '2026-10-31', 30, 'open', p_manager) returning id into b_stats;
  insert into public.course_batches (course_id, name, starts_on, ends_on, capacity, status, created_by)
  values (c_db, 'Section A', '2026-06-01', '2026-11-15', 20, 'closed', p_manager) returning id into b_db;

  -- Enrollment: approved requests become enrollments; a few are pending or rejected ------
  for e in
    select p.id as student_id, x.course_id, x.batch_id, x.on_day
      from (values
        ('student4@bigsms.demo',  c_prog, b_prog_a, date '2026-05-26'), ('student5@bigsms.demo',  c_prog, b_prog_a, date '2026-05-26'),
        ('student6@bigsms.demo',  c_prog, b_prog_a, date '2026-05-27'), ('student7@bigsms.demo',  c_prog, b_prog_b, date '2026-05-27'),
        ('student8@bigsms.demo',  c_prog, b_prog_b, date '2026-05-28'),
        ('student9@bigsms.demo',  c_stats, b_stats, date '2026-05-26'), ('student10@bigsms.demo', c_stats, b_stats, date '2026-05-26'),
        ('student11@bigsms.demo', c_stats, b_stats, date '2026-05-27'), ('student12@bigsms.demo', c_stats, b_stats, date '2026-05-27'),
        ('student4@bigsms.demo',  c_stats, b_stats, date '2026-05-28'), ('student5@bigsms.demo',  c_stats, b_stats, date '2026-05-28'),
        ('student7@bigsms.demo',  c_web, null, date '2026-05-29'), ('student8@bigsms.demo',  c_web, null, date '2026-05-29'),
        ('student9@bigsms.demo',  c_web, null, date '2026-05-30'), ('student12@bigsms.demo', c_web, null, date '2026-05-30'),
        ('student4@bigsms.demo',  c_db, b_db, date '2026-05-30'), ('student6@bigsms.demo',  c_db, b_db, date '2026-05-30'),
        ('student10@bigsms.demo', c_db, b_db, date '2026-05-31'), ('student11@bigsms.demo', c_db, b_db, date '2026-05-31'),
        ('student@bigsms.demo',   c_db, b_db, date '2026-06-01'), ('student2@bigsms.demo',  c_db, b_db, date '2026-06-01'),
        ('student5@bigsms.demo',  c_comm, null, date '2026-06-01'), ('student7@bigsms.demo',  c_comm, null, date '2026-06-01'),
        ('student12@bigsms.demo', c_comm, null, date '2026-06-02'), ('student3@bigsms.demo',  c_comm, null, date '2026-06-02'),
        ('student6@bigsms.demo',  c_lin, null, date '2026-06-02'), ('student11@bigsms.demo', c_lin, null, date '2026-06-03'),
        ('student2@bigsms.demo',  c_lin, null, date '2026-06-03')
      ) as x(email, course_id, batch_id, on_day)
      join public.profiles p on p.email = x.email
  loop
    insert into public.enrollment_requests (request_no, student_id, course_id, batch_id, note, status, submitted_by, submitted_at,
                                            reviewed_by, reviewed_at, created_at)
    values (public.next_document_no('ENR'), e.student_id, e.course_id, e.batch_id, '', 'approved', p_manager, e.on_day - 2,
            p_principal, e.on_day, e.on_day - 2)
    returning id into v_id;
    insert into public.enrollments (course_id, student_id, enrolled_at, batch_id, approved_by, request_id)
    values (e.course_id, e.student_id, e.on_day + time '10:00', e.batch_id, p_principal, v_id)
    on conflict do nothing;
  end loop;
  -- Original demo students go into classes.
  update public.enrollments set batch_id = b_prog_a where course_id = c_prog and student_id in (s_sara, s_bilal) and batch_id is null;
  update public.enrollments set batch_id = b_prog_b where course_id = c_prog and student_id = s_zara and batch_id is null;
  update public.enrollments set batch_id = b_stats where course_id = c_stats and batch_id is null;

  insert into public.enrollment_requests (request_no, student_id, course_id, batch_id, note, status, submitted_by, submitted_at)
  select public.next_document_no('ENR'), p.id, x.course_id, x.batch_id, x.note, 'pending', p_manager, now() - interval '1 day'
    from (values ('student8@bigsms.demo', c_db, b_db, 'Wants to add a second course'),
                 ('student9@bigsms.demo', c_lin, null::uuid, 'Recommended by Faculty')) as x(email, course_id, batch_id, note)
    join public.profiles p on p.email = x.email;
  insert into public.enrollment_requests (request_no, student_id, course_id, batch_id, note, status, submitted_by, submitted_at,
                                          reviewed_by, reviewed_at, review_note)
  select public.next_document_no('ENR'), id, c_comm, null, 'Late joiner', 'rejected', p_manager, '2026-09-20', p_principal, '2026-09-21',
         'The course is past its midpoint; enrol in the next intake.'
    from public.profiles where email = 'student10@bigsms.demo';

  -- Lecture progress ------------------------------------------------------------------------
  insert into public.lecture_progress (student_id, lecture_id, course_id, completed_at)
  select en.student_id, l.id, l.course_id,
         en.enrolled_at + make_interval(days => 7 * l.position + abs(hashtext(en.student_id::text || l.id::text)) % 10)
    from public.enrollments en
    join public.lectures l on l.course_id = en.course_id
   where abs(hashtext(en.student_id::text || l.id::text)) % 100 < 75
     and en.enrolled_at + make_interval(days => 7 * l.position) < now()
  on conflict do nothing;

  -- Student records and applications ---------------------------------------------------------
  insert into public.student_records (student_id, date_of_birth, gender, address, guardian_name, guardian_phone, guardian_relation,
                                      previous_school, program, admitted_on, fee_plan, payment_method, updated_by)
  select p.id, date '2006-01-15' + (abs(hashtext(p.id::text)) % 900),
         case when p.full_name in ('Sara Khan', 'Zara Malik', 'Fatima Noor', 'Ayesha Siddiqa', 'Mariam Javed', 'Hira Aslam') then 'female' else 'male' end,
         (array['House 12, Street 4, DHA Phase 5, Lahore', 'Flat 3B, Gulberg III, Lahore', '45-C Model Town, Lahore', '7 Cantt View, Lahore Cantt'])[1 + abs(hashtext(p.email)) % 4],
         'Guardian of ' || p.full_name, '0321-' || lpad((abs(hashtext(p.email)) % 9000000)::text, 7, '0'),
         (array['Father', 'Mother', 'Uncle'])[1 + abs(hashtext(p.id::text)) % 3],
         (array['Cathedral School', 'Garrison Academy', 'Beaconhouse', 'Lahore Grammar School'])[1 + abs(hashtext(p.full_name)) % 4],
         'Diploma in Information Technology', '2026-05-25',
         (array['full', 'partial', 'installment'])[1 + abs(hashtext(p.email)) % 3]::public.fee_plan,
         (array['cash', 'bank_transfer', 'cheque'])[1 + abs(hashtext(p.full_name)) % 3]::public.payment_method,
         p_manager
    from public.profiles p where p.role = 'student'
  on conflict (student_id) do nothing;

  for r in
    select * from (values
      ('Hassan Raza',  'hassan.raza@example.com',  'Introduction to Programming', 'submitted',    null::text, null::text),
      ('Sana Malik',   'sana.malik@example.com',   'Statistics 101',              'under_review', null, null),
      ('Iqra Shah',    'iqra.shah@example.com',    'Database Systems',            'submitted',    null, null),
      ('Rehan Akhtar', 'rehan.akhtar@example.com', 'Web Development Basics',      'rejected',     'Does not meet the intermediate marks requirement.', null),
      ('Ali Hassan',   'student4@bigsms.demo',     'Introduction to Programming', 'accepted',     'Admitted to Morning A.', 'student4@bigsms.demo'),
      ('Fatima Noor',  'student5@bigsms.demo',     'Statistics 101',              'accepted',     'Admitted.', 'student5@bigsms.demo')
    ) as t(full_name, email, program, status, note, account)
  loop
    insert into public.student_applications (full_name, email, phone, date_of_birth, gender, address, guardian_name, guardian_phone,
                                             guardian_relation, previous_school, program, statement, fee_plan, payment_method, created_at)
    values (r.full_name, r.email, '0333-' || lpad((abs(hashtext(r.email)) % 9000000)::text, 7, '0'), '2006-08-20',
            case when r.full_name in ('Sana Malik', 'Iqra Shah', 'Fatima Noor') then 'female' else 'male' end,
            'Lahore', 'Guardian of ' || r.full_name, '0300-5550000', 'Father', 'Garrison Academy', r.program,
            'I want to build a career in ' || r.program || '.',
            'installment', 'bank_transfer', case when r.status = 'accepted' then timestamptz '2026-05-20' else now() - interval '3 days' end)
    returning id into v_id;
    update public.student_applications
       set status = r.status::public.application_status, decision_note = r.note,
           reviewed_by = case when r.status in ('accepted', 'rejected', 'under_review') then p_manager end,
           reviewed_at = case when r.status in ('accepted', 'rejected') then now() - interval '2 days' end,
           student_id = (select id from public.profiles where email = r.account)
     where id = v_id;
  end loop;

  -- Timetable: published, the same as the draft ---------------------------------------------
  delete from public.timetable_slots where room in ('Test Room', 'Test Room 2');
  delete from public.calendar_events where title = 'Test Holiday';
  for r in
    select * from (values
      (c_prog, b_prog_a, 1, '09:00', '10:30', 'Room 101'), (c_prog, b_prog_b, 2, '14:00', '15:30', 'Room 101'),
      (c_prog, b_prog_a, 3, '09:00', '10:30', 'Lab 1'),    (c_prog, b_prog_b, 4, '14:00', '15:30', 'Lab 1'),
      (c_web, null, 2, '09:00', '10:30', 'Lab 2'),         (c_web, null, 4, '09:00', '10:30', 'Lab 2'),
      (c_lin, null, 5, '11:00', '12:30', 'Room 103'),
      (c_stats, b_stats, 1, '11:00', '12:30', 'Room 102'), (c_stats, b_stats, 3, '11:00', '12:30', 'Room 102'),
      (c_db, b_db, 1, '14:00', '15:30', 'Lab 2'),          (c_db, b_db, 4, '11:00', '12:30', 'Lab 2'),
      (c_comm, null, 2, '11:00', '12:30', 'Room 103'),     (c_comm, null, 5, '09:00', '10:30', 'Room 103')
    ) as t(course_id, batch_id, weekday, starts_at, ends_at, room)
  loop
    insert into public.timetable_slots (course_id, batch_id, weekday, starts_at, ends_at, room, state)
    values (r.course_id, r.batch_id, r.weekday, r.starts_at::time, r.ends_at::time, r.room, 'draft'),
           (r.course_id, r.batch_id, r.weekday, r.starts_at::time, r.ends_at::time, r.room, 'live');
  end loop;
  for r in
    select * from (values
      ('Mid-term examinations', 'exam', date '2026-10-19', date '2026-10-23', 'Classes are replaced by exams this week.'),
      ('Iqbal Day', 'holiday', date '2026-11-09', date '2026-11-09', ''),
      ('Annual Sports Day', 'event', date '2026-11-20', date '2026-11-20', 'All students at the main ground from 9:00.'),
      ('Final examinations', 'exam', date '2026-12-07', date '2026-12-18', ''),
      ('Winter break', 'holiday', date '2026-12-21', date '2026-12-31', 'Includes Quaid-e-Azam Day on 25 December.'),
      ('Term 2 begins', 'term', date '2027-01-04', date '2027-01-04', '')
    ) as t(title, kind, starts_on, ends_on, notes)
  loop
    insert into public.calendar_events (title, kind, starts_on, ends_on, notes, state)
    values (r.title, r.kind, r.starts_on, r.ends_on, r.notes, 'draft'), (r.title, r.kind, r.starts_on, r.ends_on, r.notes, 'live');
  end loop;
  v_pub_snapshot := public.timetable_draft_snapshot();
  insert into public.timetable_publications (publication_no, status, note, snapshot, slot_count, event_count, requested_by, requested_at,
                                             reviewed_by, reviewed_at)
  values (public.next_document_no('TT'), 'approved', 'Term 1 timetable with classes and the academic calendar', v_pub_snapshot,
          jsonb_array_length(v_pub_snapshot -> 'slots'), jsonb_array_length(v_pub_snapshot -> 'events'), p_manager, now() - interval '2 hours',
          p_principal, now() - interval '1 hour');

  -- Student attendance: weekly registers, June to yesterday ----------------------------------
  for r in
    select * from (values
      (c_prog, b_prog_a, 1, f_omar), (c_prog, b_prog_b, 2, f_omar), (c_web, null::uuid, 2, f_omar), (c_lin, null, 5, f_omar),
      (c_stats, b_stats, 1, f_lina), (c_db, b_db, 1, f_ahmed), (c_comm, null, 2, f_ahmed)
    ) as t(course_id, batch_id, weekday, faculty)
  loop
    for v_day in
      select d::date from generate_series(date '2026-06-01', current_date - 1, interval '1 day') d
       where extract(isodow from d) = r.weekday
    loop
      insert into public.attendance_sessions (course_id, batch_id, held_on, topic, taken_by, submitted_at, submitted_by)
      values (r.course_id, r.batch_id, v_day, 'Week ' || (1 + (v_day - date '2026-06-01') / 7), r.faculty, v_day + time '18:00', r.faculty)
      returning id into v_session;
      insert into public.attendance_records (session_id, student_id, status, note, marked_by, marked_at)
      select v_session, en.student_id,
             case when h < 84 then 'present' when h < 91 then 'late' when h < 97 then 'absent' else 'excused' end::public.attendance_status,
             case when h >= 97 then 'Medical leave' else '' end, r.faculty, v_day + time '17:00'
        from (select en.student_id, abs(hashtext(v_session::text || en.student_id::text)) % 100 as h
                from public.enrollments en
               where en.course_id = r.course_id and (r.batch_id is null or en.batch_id = r.batch_id)
                 and en.enrolled_at::date <= v_day) en;
    end loop;
  end loop;
  -- Today's register for Statistics is still a draft.
  insert into public.attendance_sessions (course_id, batch_id, held_on, topic, taken_by)
  values (c_stats, b_stats, current_date, 'Revision', f_lina) returning id into v_session;

  -- Staff and Faculty attendance: weekdays since September --------------------------------------
  insert into public.staff_attendance (employee_id, attended_on, status, check_in, check_out, note, marked_by, marked_at)
  select p.id, d::date,
         case when h < 88 then 'present' when h < 94 then 'late' when h < 96 then 'half_day' when h < 98 then 'leave' else 'absent' end::public.staff_attendance_status,
         case when h < 98 then time '08:50' + make_interval(mins => case when h between 88 and 93 then 25 + h % 20 else h % 12 end) end,
         case when h < 98 then case when h between 94 and 95 then time '13:00' else time '16:30' + make_interval(mins => h % 30) end end,
         case when h between 96 and 97 then 'Annual leave' else '' end,
         case when p.id = p_principal then p_manager else p_principal end, d::date + time '17:30'
    from public.profiles p
    cross join generate_series(date '2026-09-01', current_date - 1, interval '1 day') d
    cross join lateral (select abs(hashtext(p.id::text || d::text)) % 100 as h) hh
   where p.role in ('super_admin', 'admin', 'admin_manager', 'principal', 'professor', 'staff') and p.status = 'active'
     and extract(isodow from d) <= 5
  on conflict do nothing;

  -- Assignments and submissions ------------------------------------------------------------
  for r in
    select * from (values
      (c_prog, 'Variables and input', 'Write a program that asks for a name and age and prints a greeting.', timestamptz '2026-06-20 23:59+05', 20, 'course', null::uuid),
      (c_prog, 'Loops practice', 'Print a multiplication table for any number using a for loop.', timestamptz '2026-08-08 23:59+05', 20, 'course', null),
      (c_prog, 'Evening B: functions workshop', 'Refactor last week''s program into functions.', timestamptz '2026-09-19 23:59+05', 20, 'batch', b_prog_b),
      (c_prog, 'Mini project: grade calculator', 'Read marks for five subjects and print the grade.', timestamptz '2026-10-20 23:59+05', 50, 'course', null),
      (c_web, 'Personal profile page', 'Build a one-page HTML profile.', timestamptz '2026-07-05 23:59+05', 30, 'course', null),
      (c_web, 'Responsive layout', 'Make your profile page work on a phone using flexbox.', timestamptz '2026-09-05 23:59+05', 30, 'course', null),
      (c_stats, 'Descriptive statistics', 'Compute mean, median and standard deviation for the data set provided.', timestamptz '2026-07-12 23:59+05', 25, 'course', null),
      (c_stats, 'Probability problems', 'Solve the ten problems on the worksheet.', timestamptz '2026-09-12 23:59+05', 25, 'course', null),
      (c_db, 'ER diagram', 'Draw an ER diagram for a library system.', timestamptz '2026-07-10 23:59+05', 30, 'course', null),
      (c_db, 'SQL queries', 'Write the 12 queries on the sheet against the sample database.', timestamptz '2026-09-25 23:59+05', 40, 'course', null),
      (c_comm, 'Formal email', 'Write an email requesting a meeting with a client.', timestamptz '2026-07-03 23:59+05', 10, 'course', null),
      (c_comm, 'Five-minute presentation', 'Present a product to the class; submit your slides.', timestamptz '2026-09-18 23:59+05', 20, 'course', null),
      (c_lin, 'Matrix operations', 'Exercises 2.1 to 2.10.', timestamptz '2026-08-28 23:59+05', 20, 'course', null)
    ) as t(course_id, title, instructions, due_at, max_score, audience, batch_id)
  loop
    insert into public.assignments (course_id, title, instructions, due_at, max_score, published, audience, batch_id,
                                    assigned_at, assigned_by, created_at)
    values (r.course_id, r.title, r.instructions, r.due_at, r.max_score, true, r.audience, r.batch_id,
            r.due_at - interval '14 days', (select professor_id from public.courses where id = r.course_id), r.due_at - interval '15 days')
    returning id into v_assign;
    for s in
      select en.student_id, abs(hashtext(v_assign::text || en.student_id::text)) % 100 as h
        from public.enrollments en
       where en.course_id = r.course_id and (r.batch_id is null or en.batch_id = r.batch_id)
    loop
      continue when r.due_at > now() + interval '1 day' and s.h < 50;  -- upcoming: about half have handed in
      if s.h >= 94 and r.due_at < now() then
        insert into public.submissions (assignment_id, student_id, content, status, submitted_at, late)
        values (v_assign, s.student_id, '', 'missing', r.due_at + interval '2 days', false);
        continue;
      end if;
      continue when s.h >= 90;  -- not handed in yet
      v_sub := r.due_at - make_interval(hours => 2 + s.h % 70) + case when s.h between 80 and 89 then interval '3 days' else interval '0' end;
      continue when v_sub > now();
      if r.due_at < now() - interval '5 days' and s.h % 7 <> 0 then
        v_pct := 55 + (s.h * 37) % 45;
        insert into public.submissions (assignment_id, student_id, content, link_url, status, score, feedback, submitted_at,
                                        graded_at, graded_by, late)
        values (v_assign, s.student_id, 'My work for ' || r.title || ' is in the shared folder.',
                'https://docs.example.com/' || left(s.student_id::text, 8), 'graded',
                round(r.max_score * v_pct / 100.0 * 2) / 2,
                (array['Good work.', 'Well structured, check your edge cases.', 'Clear and complete.', 'Needs more explanation.', 'Excellent.'])[1 + s.h % 5],
                v_sub, r.due_at + make_interval(days => 3 + s.h % 6), (select professor_id from public.courses where id = r.course_id),
                v_sub > r.due_at);
      else
        insert into public.submissions (assignment_id, student_id, content, link_url, status, submitted_at, late)
        values (v_assign, s.student_id, 'Submission for ' || r.title || '.', 'https://docs.example.com/' || left(s.student_id::text, 8),
                'submitted', v_sub, v_sub > r.due_at);
      end if;
    end loop;
  end loop;

  -- Exams: a class test and a midterm with published results, a final ahead -------------------
  for c in select id, professor_id, title from public.courses where id in (c_prog, c_web, c_stats, c_lin, c_db, c_comm) loop
    -- Class test (results published)
    insert into public.exams (course_id, title, kind, held_on, max_marks, created_by, instructions, mode, audience,
                              assigned_at, assigned_by, results_status, submitted_at, submitted_by, approved_at, approved_by)
    values (c.id, 'Class test 1', 'class_test', '2026-07-15', 20, c.professor_id, 'Closed book, 40 minutes.', 'offline', 'course',
            '2026-07-01', c.professor_id, 'approved', '2026-07-18', c.professor_id, '2026-07-20', p_principal)
    returning id into v_exam;
    insert into public.exam_results (exam_id, student_id, marks, absent, remarks, entered_by, entered_at)
    select v_exam, en.student_id,
           case when h >= 96 then null else round(20 * (45 + (h * 53) % 54) / 100.0 * 2) / 2 end, h >= 96,
           case when h >= 96 then 'Absent' when h % 5 = 0 then 'Well prepared' else '' end, c.professor_id, '2026-07-17'
      from (select student_id, abs(hashtext(v_exam::text || student_id::text)) % 100 h from public.enrollments
             where course_id = c.id and enrolled_at < '2026-07-15') en;

    -- Midterm (published, except Database Systems which awaits the Principal)
    insert into public.exams (course_id, title, kind, held_on, max_marks, created_by, instructions, mode, audience,
                              assigned_at, assigned_by, results_status, submitted_at, submitted_by, approved_at, approved_by)
    values (c.id, 'Midterm examination', 'midterm', '2026-09-10', 50, c.professor_id, 'Answer all questions. Calculators allowed.', 'offline', 'course',
            '2026-08-25', c.professor_id,
            case when c.id = c_db then 'pending' else 'approved' end, '2026-09-16', c.professor_id,
            case when c.id = c_db then null else timestamptz '2026-09-18' end, case when c.id = c_db then null else p_principal end)
    returning id into v_exam;
    insert into public.exam_results (exam_id, student_id, marks, absent, remarks, entered_by, entered_at)
    select v_exam, en.student_id,
           case when h >= 97 then null else round(50 * (40 + (h * 61) % 59) / 100.0 * 2) / 2 end, h >= 97,
           case when h >= 97 then 'Absent' when h % 6 = 0 then 'Strong answers' else '' end, c.professor_id, '2026-09-15'
      from (select student_id, abs(hashtext(v_exam::text || student_id::text)) % 100 h from public.enrollments where course_id = c.id) en;

    -- Final (assigned, ahead)
    insert into public.exams (course_id, title, kind, held_on, max_marks, created_by, instructions, mode, starts_at, duration_minutes,
                              audience, assigned_at, assigned_by, results_status)
    values (c.id, 'Final examination', 'final', case when c.id = c_prog then date '2026-12-08' else date '2026-12-10' end, 100, c.professor_id,
            'Covers the whole course.', case when c.id = c_prog then 'online' else 'offline' end,
            case when c.id = c_prog then timestamptz '2026-12-08 10:00+05' end, case when c.id = c_prog then 120 end,
            'course', now() - interval '3 days', c.professor_id, 'draft')
    returning id into v_exam;
    if c.id = c_prog then
      insert into public.exam_papers (exam_id, paper)
      values (v_exam, E'Answer all questions.\n1. Explain the difference between a list and a dictionary. (10)\n2. Write a function that returns the largest of three numbers. (20)\n3. Read ten marks and print their average and grade. (30)\n4. Trace the program given and state its output. (40)');
    end if;
  end loop;

  -- Final reports: submitted for Statistics 101 and Web Development Basics ----------------------
  insert into public.final_reports (course_id, student_id, percentage, grade, remarks, entered_by, updated_at, submitted_at, submitted_by)
  select en.course_id, en.student_id, x.pct,
         case when x.pct >= 90 then 'A+' when x.pct >= 80 then 'A' when x.pct >= 70 then 'B' when x.pct >= 60 then 'C' when x.pct >= 50 then 'D' else 'F' end,
         case when x.pct >= 80 then 'Excellent term.' when x.pct >= 60 then 'Steady progress.' else 'Needs to improve attendance and practice.' end,
         co.professor_id, '2026-10-02', '2026-10-03', co.professor_id
    from public.enrollments en
    join public.courses co on co.id = en.course_id
    cross join lateral (select round((55 + abs(hashtext(en.student_id::text || en.course_id::text)) % 43)::numeric, 1) as pct) x
   where en.course_id in (c_stats, c_web)
  on conflict do nothing;
  -- Introduction to Programming: a draft for some students.
  insert into public.final_reports (course_id, student_id, percentage, grade, remarks, entered_by, updated_at)
  select en.course_id, en.student_id, 70 + abs(hashtext(en.student_id::text)) % 25, '', '', f_omar, now()
    from public.enrollments en where en.course_id = c_prog and abs(hashtext(en.student_id::text)) % 2 = 0
  on conflict do nothing;

  -- Fees: tuition per course, registration per student, a mix of paid, partial and unpaid -----
  for e in
    select en.student_id, en.course_id, co.title, coalesce(co.fee, 15000) fee, abs(hashtext(en.student_id::text || en.course_id::text)) % 100 h
      from public.enrollments en join public.courses co on co.id = en.course_id
  loop
    insert into public.invoices (student_id, title, description, amount, due_on, issued_by, created_at)
    values (e.student_id, 'Tuition: ' || e.title, 'Term 1 tuition fee', e.fee,
            case when e.h % 2 = 0 then date '2026-06-30' else date '2026-09-30' end, p_manager, '2026-06-01')
    returning id into v_inv;
    if e.h < 55 then
      insert into public.payments (invoice_id, amount, payment_type, method, paid_on, reference, received_by)
      values (v_inv, e.fee, 'full', (array['cash', 'bank_transfer', 'cheque'])[1 + e.h % 3]::public.payment_method,
              '2026-06-10'::date + e.h % 40, case when e.h % 3 = 0 then '' when e.h % 3 = 1 then 'IBFT' || (100000 + e.h * 731) else 'CHQ-' || (40000 + e.h * 17) end, p_manager);
    elsif e.h < 80 then
      insert into public.payments (invoice_id, amount, payment_type, method, paid_on, reference, received_by)
      values (v_inv, round(e.fee / 2), 'installment', 'bank_transfer', '2026-06-15'::date + e.h % 20, 'IBFT' || (200000 + e.h * 913), p_manager);
      if e.h < 68 then
        insert into public.payments (invoice_id, amount, payment_type, method, paid_on, reference, received_by)
        values (v_inv, e.fee - round(e.fee / 2), 'installment', 'cash', '2026-08-15'::date + e.h % 20, '', p_manager);
      end if;
    elsif e.h < 90 then
      insert into public.payments (invoice_id, amount, payment_type, method, paid_on, reference, received_by)
      values (v_inv, round(e.fee * 0.3), 'partial', 'cash', '2026-07-01'::date + e.h % 20, '', p_manager);
    end if;
  end loop;
  for s in select id from public.profiles where role = 'student' and status = 'active' loop
    insert into public.invoices (student_id, title, description, amount, due_on, issued_by, created_at)
    values (s.id, 'Registration fee', 'One-time registration and ID card', 5000, '2026-06-05', p_manager, '2026-05-25')
    returning id into v_inv;
    insert into public.payments (invoice_id, amount, payment_type, method, paid_on, reference, received_by)
    values (v_inv, 5000, 'full', 'cash', '2026-05-30', '', p_manager);
  end loop;

  -- Staff salaries: details for everyone, August and September paid, October pending --------
  insert into public.staff_salaries (employee_id, monthly_amount, payment_method, bank_name, account_no, effective_from, notes, updated_by)
  select p.id,
         case p.role when 'principal' then 300000 when 'super_admin' then 220000 when 'admin' then 150000 when 'admin_manager' then 140000
                     when 'professor' then 170000 + (abs(hashtext(p.id::text)) % 3) * 5000 else 80000 + (abs(hashtext(p.id::text)) % 2) * 5000 end,
         'bank_transfer', (array['HBL', 'Meezan Bank', 'Bank Alfalah', 'UBL'])[1 + abs(hashtext(p.email)) % 4],
         'PK' || lpad((abs(hashtext(p.email)) % 100000000)::text, 8, '0') || '0001', '2026-05-01', '',
         case when p.id = p_manager then p_principal else p_manager end
    from public.profiles p
   where p.role in ('super_admin', 'admin', 'admin_manager', 'principal', 'professor', 'staff') and p.status = 'active'
  on conflict (employee_id) do nothing;
  for r in select employee_id, monthly_amount from public.staff_salaries loop
    for v_day in select unnest(array[date '2026-08-01', date '2026-09-01', date '2026-10-01']) loop
      insert into public.salary_payments (employee_id, period, amount, due_on, notes, created_by)
      values (r.employee_id, v_day, r.monthly_amount, (v_day + interval '1 month - 1 day')::date, '',
              case when r.employee_id = p_manager then p_principal else p_manager end)
      returning id into v_id;
      if v_day < date '2026-10-01' then
        update public.salary_payments
           set status = 'paid', method = 'bank_transfer', reference = 'SAL-IBFT-' || to_char(v_day, 'YYYYMM') || '-' || left(r.employee_id::text, 6),
               paid_on = (v_day + interval '1 month - 1 day')::date, paid_by = case when r.employee_id = p_manager then p_principal else p_manager end
         where id = v_id;
      end if;
    end loop;
  end loop;
  update public.salary_payments set status = 'on_hold', notes = 'Bank details being verified'
   where period = '2026-10-01' and employee_id = (select id from public.profiles where email = 'staff2@bigsms.demo');

  -- Certificates: Statistics 101 approved and issued; Web Development awaiting the Principal ---
  insert into public.certificate_lists (title, course_id, kind, criteria) values
    ('Statistics 101: completion', c_stats, 'completion', 'Final report submitted, attendance at least 75%, fees cleared') returning id into v_list;
  update public.certificate_lists set prepared_by = p_manager, created_at = '2026-10-04' where id = v_list;
  insert into public.certificate_list_entries (list_id, student_id, note, added_by, added_at)
  select v_list, en.student_id, '', p_manager, '2026-10-04' from public.enrollments en where en.course_id = c_stats;
  update public.certificate_list_entries le
     set (completion_rate, attendance_rate, outstanding_fees, exam_average, final_percentage, final_grade) =
         (select el.completion_rate, el.attendance_rate, el.outstanding_fees, el.exam_average, el.final_percentage, el.final_grade
            from public.student_eligibility(le.student_id, c_stats) el)
   where le.list_id = v_list;
  update public.certificate_lists
     set status = 'approved', submitted_at = '2026-10-05', reviewed_by = p_principal, reviewed_at = '2026-10-06', review_note = 'Approved. Well done to all.'
   where id = v_list;
  for s in select student_id from public.certificate_list_entries where list_id = v_list loop
    insert into public.certificates (student_id, course_id, kind, title, description, issued_on, issued_by, list_id)
    values (s.student_id, c_stats, 'completion', 'Certificate of Completion: Statistics 101',
            'Successfully completed Statistics 101.', '2026-10-06', p_principal, v_list)
    returning id into v_cert;
    update public.certificate_list_entries set certificate_id = v_cert where list_id = v_list and student_id = s.student_id;
  end loop;

  insert into public.certificate_lists (title, course_id, kind, criteria) values
    ('Web Development Basics: completion', c_web, 'completion', 'Final report submitted') returning id into v_list;
  update public.certificate_lists set prepared_by = p_manager where id = v_list;
  insert into public.certificate_list_entries (list_id, student_id, note, added_by)
  select v_list, en.student_id, '', p_manager from public.enrollments en where en.course_id = c_web;
  update public.certificate_list_entries le
     set (completion_rate, attendance_rate, outstanding_fees, exam_average, final_percentage, final_grade) =
         (select el.completion_rate, el.attendance_rate, el.outstanding_fees, el.exam_average, el.final_percentage, el.final_grade
            from public.student_eligibility(le.student_id, c_web) el)
   where le.list_id = v_list;
  update public.certificate_lists set status = 'submitted', submitted_at = now() - interval '1 day' where id = v_list;

  insert into public.certificate_lists (title, course_id, kind, criteria) values
    ('Introduction to Programming: merit', c_prog, 'merit', 'Top performers once final reports are in');
  update public.certificate_lists set prepared_by = p_manager where title = 'Introduction to Programming: merit';

  -- Result changes (Faculty request, Principal approves) ----------------------------------------
  for e in
    select x.id as exam_id, x.course_id, r2.student_id, r2.marks, r2.absent, r2.remarks, x.title, co.professor_id
      from public.exams x join public.courses co on co.id = x.course_id
      join public.exam_results r2 on r2.exam_id = x.id
     where x.course_id = c_prog and x.kind = 'midterm' and not r2.absent
     order by r2.student_id limit 1
  loop
    insert into public.result_changes (change_no, kind, course_id, student_id, target_id, label, old_value, new_value, reason, status, requested_by, requested_at)
    values (public.next_document_no('RC'), 'exam_result', e.course_id, e.student_id, e.exam_id, e.title,
            jsonb_build_object('marks', e.marks, 'absent', e.absent, 'remarks', e.remarks),
            jsonb_build_object('marks', least(e.marks + 4, 50), 'absent', false, 'remarks', 'Re-marked question 4'),
            'Question 4 was marked out of 6 instead of 10; re-marking adds 4 marks.', 'pending', e.professor_id, now() - interval '5 hours');
  end loop;
  for e in
    select x.id as exam_id, x.course_id, r2.student_id, r2.marks, r2.absent, r2.remarks, x.title, co.professor_id
      from public.exams x join public.courses co on co.id = x.course_id
      join public.exam_results r2 on r2.exam_id = x.id
     where x.course_id = c_stats and x.kind = 'class_test' and not r2.absent
     order by r2.student_id limit 1
  loop
    insert into public.result_changes (change_no, kind, course_id, student_id, target_id, label, old_value, new_value, reason, status,
                                       requested_by, requested_at, reviewed_by, reviewed_at, review_note)
    values (public.next_document_no('RC'), 'exam_result', e.course_id, e.student_id, e.exam_id, e.title,
            jsonb_build_object('marks', e.marks, 'absent', e.absent, 'remarks', e.remarks),
            jsonb_build_object('marks', e.marks, 'absent', e.absent, 'remarks', 'Totalling error corrected'),
            'Remark added after a totalling check.', 'approved', e.professor_id, '2026-07-22', p_principal, '2026-07-23', 'Approved.');
  end loop;

  -- Profile change requests -----------------------------------------------------------------
  insert into public.profile_change_requests (request_no, student_id, changes, current_values, reason, status, submitted_at)
  select public.next_document_no('PCR'), p.id, jsonb_build_object('phone', '0345-7654321'), jsonb_build_object('phone', p.phone),
         'New mobile number', 'submitted', now() - interval '6 hours'
    from public.profiles p where p.email = 'student6@bigsms.demo';
  insert into public.profile_change_requests (request_no, student_id, changes, current_values, reason, status, submitted_at,
                                              forwarded_by, forwarded_at, manager_note)
  select public.next_document_no('PCR'), p.id, jsonb_build_object('full_name', 'Ayesha Siddiqa Khan'), jsonb_build_object('full_name', p.full_name),
         'Name on matriculation certificate', 'forwarded', now() - interval '2 days', p_manager, now() - interval '1 day', 'Checked against the certificate copy.'
    from public.profiles p where p.email = 'student7@bigsms.demo';

  -- KPI alerts --------------------------------------------------------------------------------
  insert into public.alerts (kpi_id, course_id, value, message, status, created_at)
  select k.id, c_lin, 38, 'Linear Algebra: lecture completion 38% is below the target', 'open', now() - interval '1 day'
    from public.kpi_definitions k where k.metric = 'completion_rate' limit 1;
  insert into public.alerts (kpi_id, course_id, value, message, status, created_at, resolved_at, resolved_by)
  select k.id, c_comm, 52, 'Business Communication: submission rate 52% is below the target', 'resolved', '2026-07-10', '2026-07-24', p_admin
    from public.kpi_definitions k where k.metric = 'submission_rate' limit 1;

  -- Quiz attempts for the new students --------------------------------------------------------
  insert into public.quiz_attempts (quiz_id, student_id, answers, score, total, submitted_at)
  select q.id, en.student_id, '{}'::jsonb, 1 + abs(hashtext(q.id::text || en.student_id::text)) % 3, 3,
         '2026-07-01'::timestamptz + make_interval(days => abs(hashtext(en.student_id::text)) % 60)
    from public.quizzes q join public.enrollments en on en.course_id = q.course_id
   where q.published
  on conflict do nothing;

  perform set_config('bigsms.review', 'off', true);
end;
$$;
