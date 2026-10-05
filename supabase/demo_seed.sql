-- Demo accounts and sample content for Big SMS. Safe to re-run.
-- Run: supabase db query --db-url "<connection string>" -f supabase/demo_seed.sql
-- All demo accounts use the password Demo@12345.

do $$
declare
  demo_password constant text := 'Demo@12345';
  u record;
  v_id uuid;
  v_admin uuid; v_prof uuid; v_prof2 uuid; v_s1 uuid; v_s2 uuid; v_s3 uuid; v_parent uuid;
  v_cs uuid; v_math uuid; v_bus uuid;
  c_prog uuid; c_web uuid; c_stats uuid; c_linear uuid; c_mkt uuid;
  l record;
  a_fizz uuid; a_site uuid; a_stats uuid;
  q_ids uuid[];
  qz_prog uuid; qz_stats uuid;
begin
  -- Users ------------------------------------------------------------------
  for u in
    select * from (values
      ('admin@bigsms.demo',      'Aisha Rahman',     'admin'),
      ('principal@bigsms.demo',  'Prof. Tariq Hussain','principal'),
      ('professor@bigsms.demo',  'Dr. Omar Siddiqui','professor'),
      ('professor2@bigsms.demo', 'Dr. Lina Haddad',  'professor'),
      ('student@bigsms.demo',    'Sara Khan',        'student'),
      ('student2@bigsms.demo',   'Bilal Ahmed',      'student'),
      ('student3@bigsms.demo',   'Zara Malik',       'student'),
      ('parent@bigsms.demo',     'Hina Khan',        'parent')
    ) as t(email, full_name, role)
  loop
    select id into v_id from auth.users where email = u.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, email_change, email_change_token_new, recovery_token
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', u.email,
        extensions.crypt(demo_password, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', u.full_name), now(), now(),
        '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', u.email, 'email_verified', true),
              'email', now(), now(), now());
    else
      update auth.users set encrypted_password = extensions.crypt(demo_password, extensions.gen_salt('bf')),
                            email_confirmed_at = coalesce(email_confirmed_at, now())
      where id = v_id;
    end if;

    update public.profiles set full_name = u.full_name, role = u.role::public.user_role, status = 'active' where id = v_id;
  end loop;

  select id into v_admin  from public.profiles where email = 'admin@bigsms.demo';
  select id into v_prof   from public.profiles where email = 'professor@bigsms.demo';
  select id into v_prof2  from public.profiles where email = 'professor2@bigsms.demo';
  select id into v_s1     from public.profiles where email = 'student@bigsms.demo';
  select id into v_s2     from public.profiles where email = 'student2@bigsms.demo';
  select id into v_s3     from public.profiles where email = 'student3@bigsms.demo';
  select id into v_parent from public.profiles where email = 'parent@bigsms.demo';

  insert into public.parent_students (parent_id, student_id) values (v_parent, v_s1) on conflict do nothing;

  -- Content only once ------------------------------------------------------
  if exists (select 1 from public.courses where professor_id = v_prof) then
    return;
  end if;

  insert into public.course_categories (name) values ('Computer Science'), ('Mathematics'), ('Business')
  on conflict (name) do nothing;
  select id into v_cs   from public.course_categories where name = 'Computer Science';
  select id into v_math from public.course_categories where name = 'Mathematics';
  select id into v_bus  from public.course_categories where name = 'Business';

  insert into public.courses (professor_id, category_id, title, description, outline, status, reviewed_by, reviewed_at)
  values (v_prof, v_cs, 'Introduction to Programming',
          'Programming fundamentals with Python: variables, control flow, functions and data structures.',
          E'Week 1: Variables and types\nWeek 2: Control flow\nWeek 3: Functions\nWeek 4: Lists and dictionaries',
          'published', v_admin, now() - interval '20 days')
  returning id into c_prog;

  insert into public.courses (professor_id, category_id, title, description, outline, status, reviewed_by, reviewed_at)
  values (v_prof, v_cs, 'Web Development Basics',
          'Build and publish your first website with HTML, CSS and a little JavaScript.',
          E'Week 1: HTML structure\nWeek 2: CSS layout\nWeek 3: JavaScript basics',
          'published', v_admin, now() - interval '15 days')
  returning id into c_web;

  insert into public.courses (professor_id, category_id, title, description, outline, status, reviewed_by, reviewed_at)
  values (v_prof2, v_math, 'Statistics 101',
          'Descriptive statistics, probability and an introduction to inference.',
          E'Week 1: Describing data\nWeek 2: Probability\nWeek 3: Distributions\nWeek 4: Confidence intervals',
          'published', v_admin, now() - interval '10 days')
  returning id into c_stats;

  insert into public.courses (professor_id, category_id, title, description, outline, status)
  values (v_prof, v_math, 'Linear Algebra', 'Vectors, matrices and linear transformations.',
          E'Week 1: Vectors\nWeek 2: Matrices\nWeek 3: Determinants', 'pending_approval')
  returning id into c_linear;

  insert into public.courses (professor_id, category_id, title, description, status)
  values (v_prof2, v_bus, 'Digital Marketing Essentials', 'SEO, social media and campaign analytics.', 'draft')
  returning id into c_mkt;

  -- Lectures
  insert into public.lectures (course_id, position, title, content) values
    (c_prog, 1, 'Variables and types', 'Numbers, strings and booleans, and how Python stores values.'),
    (c_prog, 2, 'Control flow', 'if/elif/else, for and while loops.'),
    (c_prog, 3, 'Functions', 'Defining functions, parameters and return values.'),
    (c_prog, 4, 'Lists and dictionaries', 'Working with collections of data.'),
    (c_web, 1, 'HTML structure', 'Elements, attributes and semantic markup.'),
    (c_web, 2, 'CSS layout', 'Box model, flexbox and grid.'),
    (c_web, 3, 'JavaScript basics', 'Variables, events and the DOM.'),
    (c_stats, 1, 'Describing data', 'Mean, median, mode and spread.'),
    (c_stats, 2, 'Probability', 'Events, independence and conditional probability.'),
    (c_stats, 3, 'Distributions', 'Normal and binomial distributions.'),
    (c_linear, 1, 'Vectors', 'Vector operations and geometry.');

  insert into public.materials (course_id, type, title, external_url) values
    (c_prog, 'video', 'Python crash course (video)', 'https://www.youtube.com/results?search_query=python+crash+course'),
    (c_prog, 'book', 'Think Python (free book)', 'https://greenteapress.com/wp/think-python-2e/'),
    (c_web, 'notes', 'MDN: Learn web development', 'https://developer.mozilla.org/en-US/docs/Learn'),
    (c_stats, 'book', 'OpenIntro Statistics (free book)', 'https://www.openintro.org/book/os/');

  -- Enrolments
  insert into public.enrollments (course_id, student_id) values
    (c_prog, v_s1), (c_prog, v_s2), (c_prog, v_s3),
    (c_web, v_s1), (c_web, v_s2),
    (c_stats, v_s1), (c_stats, v_s3);

  -- Lecture progress
  for l in select id, course_id, position from public.lectures where course_id in (c_prog, c_web, c_stats) loop
    if l.course_id = c_prog and l.position <= 3 then
      insert into public.lecture_progress (student_id, lecture_id, course_id) values (v_s1, l.id, l.course_id);
    end if;
    if l.course_id = c_prog and l.position <= 1 then
      insert into public.lecture_progress (student_id, lecture_id, course_id) values (v_s2, l.id, l.course_id);
    end if;
    if l.course_id = c_prog then
      insert into public.lecture_progress (student_id, lecture_id, course_id) values (v_s3, l.id, l.course_id);
    end if;
    if l.course_id = c_web and l.position <= 2 then
      insert into public.lecture_progress (student_id, lecture_id, course_id) values (v_s1, l.id, l.course_id);
    end if;
    if l.course_id = c_stats and l.position = 1 then
      insert into public.lecture_progress (student_id, lecture_id, course_id) values (v_s1, l.id, l.course_id);
    end if;
  end loop;

  -- Assignments and submissions
  insert into public.assignments (course_id, title, instructions, due_at, max_score, published)
  values (c_prog, 'FizzBuzz',
          'Print 1–100, replacing multiples of 3 with Fizz, of 5 with Buzz, and of both with FizzBuzz.',
          now() + interval '5 days', 20, true)
  returning id into a_fizz;
  insert into public.assignments (course_id, title, instructions, due_at, max_score, published)
  values (c_web, 'Personal homepage', 'Build a one-page site about yourself and share the link.', now() + interval '10 days', 50, true)
  returning id into a_site;
  insert into public.assignments (course_id, title, instructions, due_at, max_score, published)
  values (c_stats, 'Survey analysis', 'Summarise the class survey data with mean, median and a histogram.', now() + interval '7 days', 100, true)
  returning id into a_stats;

  insert into public.submissions (assignment_id, student_id, content, status, score, feedback, graded_at, graded_by) values
    (a_fizz, v_s1, E'for i in range(1, 101):\n    print("Fizz"*(i%3==0) + "Buzz"*(i%5==0) or i)', 'graded', 18, 'Elegant one-liner. Add comments next time.', now() - interval '1 day', v_prof),
    (a_fizz, v_s3, E'for i in range(1, 101):\n    if i % 15 == 0: print("FizzBuzz")\n    elif i % 3 == 0: print("Fizz")\n    elif i % 5 == 0: print("Buzz")\n    else: print(i)', 'graded', 20, 'Perfect.', now() - interval '2 days', v_prof);
  insert into public.submissions (assignment_id, student_id, content, link_url) values
    (a_fizz, v_s2, 'Attempted with while loop, see link.', 'https://example.com/bilal-fizzbuzz'),
    (a_site, v_s1, 'My homepage is live.', 'https://example.com/sara');

  -- Question bank and quizzes
  with ins as (
    insert into public.questions (created_by, category_id, prompt, options, correct_index, difficulty) values
      (v_prof, v_cs, 'Which keyword defines a function in Python?', array['func', 'def', 'function', 'lambda'], 1, 'easy'),
      (v_prof, v_cs, 'What does len([1, 2, 3]) return?', array['2', '3', '4', 'Error'], 1, 'easy'),
      (v_prof, v_cs, 'Which Python type is immutable?', array['list', 'dict', 'tuple', 'set'], 2, 'medium'),
      (v_prof, v_cs, 'What is the output of 7 // 2?', array['3.5', '3', '4', '2'], 1, 'medium')
    returning id
  ) select array_agg(id) into q_ids from ins;

  insert into public.quizzes (course_id, title, description, published)
  values (c_prog, 'Python basics check', 'Four quick questions on the first lectures.', true)
  returning id into qz_prog;
  insert into public.quiz_questions (quiz_id, question_id, position)
  select qz_prog, q, ord::int from unnest(q_ids) with ordinality as t(q, ord);

  insert into public.quiz_attempts (quiz_id, student_id, answers, score, total) values
    (qz_prog, v_s3, '{}', 4, 4),
    (qz_prog, v_s2, '{}', 2, 4);

  with ins as (
    insert into public.questions (created_by, category_id, prompt, options, correct_index, difficulty) values
      (v_prof2, v_math, 'The median of 1, 3, 3, 6, 7 is…', array['3', '4', '6', '3.5'], 0, 'easy'),
      (v_prof2, v_math, 'P(A and B) for independent events equals…', array['P(A)+P(B)', 'P(A)·P(B)', 'P(A)/P(B)', '1'], 1, 'medium')
    returning id
  ) select array_agg(id) into q_ids from ins;
  insert into public.quizzes (course_id, title, description, published)
  values (c_stats, 'Week 1 quiz', 'Describing data and probability.', true)
  returning id into qz_stats;
  insert into public.quiz_questions (quiz_id, question_id, position)
  select qz_stats, q, ord::int from unnest(q_ids) with ordinality as t(q, ord);
  insert into public.quiz_attempts (quiz_id, student_id, answers, score, total) values (qz_stats, v_s1, '{}', 1, 2);

  -- Notifications
  insert into public.notifications (user_id, title, body, link) values
    (v_s1, 'Assignment graded', 'FizzBuzz: 18/20', '/student/courses/' || c_prog),
    (v_s1, 'New quiz available', 'Python basics check', '/student/courses/' || c_prog),
    (v_prof, 'Course approved', 'Web Development Basics is now published.', '/professor/courses/' || c_web),
    (v_admin, 'Course awaiting approval', 'Linear Algebra', '/admin/courses');
end;
$$;
