# Big SMS

Learning management system by Zicon, with portals for **Super Admin**, **Admin**, **Admin Manager**, **Principal**, **Faculty**, **Staff** and **Student**. (The former Parent role has been removed: existing parent accounts can sign in but have no access.)

Built with Next.js 15 (App Router, TypeScript, Server Actions), Supabase (Postgres, Auth, Storage, RLS) and Tailwind CSS using the Zicon brand colours.

## Roles

| Role | Can do |
|---|---|
| **Super Admin** | Everything Admin can, plus: create and manage Admin/Super Admin accounts and edit user IDs. |
| **Admin** | Create, onboard and offboard non-administrator users, assign categories (roles), read all courses (read-only), manage categories, question bank, KPI configuration, alert management, reports & analytics (CSV export), audit logs, system settings |
| **Admin Manager** | Reads faculty, staff, student and student fee details. Enrolls students in courses and batches (approved by the Principal). Manages student applications (online form at `/apply` and walk-ins; accepting creates the student account), records each application's fee payment mode (fee plan Full / Partial / Installment and payment method Cash / IBFT / Cheque, no Principal approval needed), student information, ID cards and documents, and course enrollment. With the Principal, keeps the **Finance** records (fees and staff salaries, below). Compiles the list of students eligible for certificates and submits it to the Principal. Checks students' profile change requests and forwards them to the Principal. Creates, edits, publishes and archives courses (with the Principal). Cannot change other roles, offboard students, reverse payments or record their own salary. |
| **Principal** | Approves or rejects student enrollments. Keeps the **Finance** records with the Admin Manager and alone may reverse a fee payment. Approve or reject certificate lists prepared by the Admin Manager, changes Faculty request to submitted results, and student profile changes forwarded by the Admin Manager. Creates, edits, publishes and archives courses (with the Admin Manager); oversight of all courses, content, student progress, reports & analytics and KPI alerts. Assigned by an admin only. |
| **Faculty** (role key `professor`) | Sees only students enrolled in their own courses (assigned classes), and of them only name, System ID, attendance, marks, progress, assignments and submission status, class timetable, exam results and final report. No student contact details, student records or financial data, and cannot enrol students or edit profiles. Enters attendance, exam marks, assignment grades and submission status, and final reports. Also: create/edit/categorise their courses and mark them ready to publish (the Principal or Admin Manager publishes); lectures and materials; quizzes from the question bank; analytics; KPI notifications |
| **Staff** | Staff portal with their details, notifications and their own attendance (staff modules to follow). |
| **Student** | Sees only their own information: no other students, Faculty, staff, administrative or other students' financial data (teachers' and signatories' names only). Cannot edit their own profile; requests changes instead. Own ID card. View assigned (published) courses and outlines, lectures and materials, mark lectures complete, submit the assignments assigned to them (also after the due date, marked late), take quizzes (one attempt, graded server-side) |

## Approval workflows

1. **Account activation**: self-registered users start as `pending` and can do nothing until an admin sets them `active`. Admin role can never be self-assigned.
2. **Course management: Draft → Publish → Edit → Archive.** A course holds its name, Course ID (e.g. `CS-101`, generated as `CRS-0001` if left blank), duration, outline, curriculum, faculty and fee. The **Principal, Admin Manager and Faculty** create and edit courses (Faculty only their own, and they cannot reassign the faculty); **only the Principal or Admin Manager publish, archive or restore** them, under **Courses** (`/courses`). Faculty mark a draft *ready to publish*, which notifies them. Editing a published course puts it in **Edit**: the changes wait in `course_edits` (unreadable by students) and students keep the published version until the changes are published, or they are discarded. Archived courses can be restored to Draft; only never-published drafts can be deleted. Admins and Super Admins have read-only access. Enforced by the `guard_course` trigger and `publish_course()` / `archive_course()` / `restore_course()` / `set_course_ready()` / `discard_course_changes()`. (This replaces the earlier submit → approve/reject chain and its configurable approval steps.)
3. **Onboarding / offboarding**: activating an account onboards it and assigns a unique user ID by category (SA, ADM, PRN, FAC, STF, STU, PAR, e.g. `STU-0001`). Offboarding (with a reason) ends access and keeps all records; the user can be re-onboarded.
4. **Certificates: Prepared by Admin Manager → Approved by Principal.** The Admin Manager compiles a list (optionally for one course; completion, attendance and unpaid fees are computed by the server) and submits it. The Principal approves, which issues a numbered certificate to every student on the list, or returns it with a note for changes and resubmission. The preparer cannot approve their own list. Certificates cannot be created any other way.
5. **Results: entered by Faculty → changes approved by Principal.** Attendance registers, exam marks and final reports are drafts until Faculty submit them; an assignment grade is submitted when saved. Submitted results are locked. Faculty may request a change with a reason; it takes effect only when the Principal approves it (`request_result_change()` / `review_result_change()`, kept in `result_changes`). Students see exam results and final reports once submitted, and absences once the register is submitted.
6. **Student profile changes: Student → Admin Manager → Principal.** Students cannot edit their profile. They request a change; the Admin Manager checks it (and may correct it) and forwards it, or returns it with a note; the change takes effect only when the Principal approves it (`profile_change_requests`).
7. **Assignments: Formulation → Assigned to students → Student submission → Faculty grading → Submission/grade status.** Faculty formulate an assignment as a draft (title, instructions, due date in Pakistan time, maximum score), then **assign** it to the whole course, one class (batch) or chosen students, who are notified (`assign_assignment()`). Only assigned students see and submit it. Students submit and resubmit until graded; work handed in **after the due date is accepted and marked as a late submission** (re-marked if the due date changes). Faculty grade handed-in work and can record a status for work not submitted online (handed in, missing, excused). Each student's status is shown per assignment: not submitted / overdue, submitted (on time or late), graded, missing or excused (`assignment_status()`). **A saved grade is final: Faculty can change it only by requesting a change, which takes effect when the Principal approves it** (workflow 5). An assignment can be withdrawn until work is handed in, and who it is for is fixed from then on. Admins and the Principal have read-only access.
8. **Finance: entered only by the Principal and the Admin Manager.** *Student fees:* invoices and payment records; each payment is Full (clears the balance), Partial (less than the balance) or an Installment, paid by Cash, IBFT or Cheque (cheque number or IBFT reference required). Admins can read fee records but not change them. *Staff salaries:* salary details per employee (monthly amount, payment mode, bank account) and a monthly record per employee, created with **Run payroll** (`generate_payroll()`), with status Pending → Due (on the due date) → Paid, or On hold. A paid salary is final. Nobody sets or pays their own salary, and employees can read only their own salary records.

9. **Student enrollment: Admin → Student Enrollment → Principal Approval.** The student office (Super Admin, Admin, Admin Manager) enrolls one or more students in a course or in a **batch** of a course (batches have dates, an optional seat limit and are Open or Closed) under **Student Enrollment** (`/enrollment`). Each student becomes a request (`ENR-2026-00001`) awaiting the Principal, who approves or rejects (with a reason), one at a time or in bulk. Only an approved request becomes the student's enrollment, or moves an enrolled student to the requested batch; nobody can insert enrollments directly (`review_enrollments()`). A rejected request can be modified (course, batch, note) and resubmitted, or withdrawn. Removing a student from a course stays with the office.
10. **Attendance** (`/attendance`). *Staff and Faculty:* a daily register for every employee (Present, Late, Half day, Absent, Leave, with optional check-in/out times), marked by the **Principal and the Admin Manager** only; nobody marks their own. Admins read it; every employee sees their own under **My Attendance**; a monthly summary exports to CSV. *Students:* Faculty take registers in the course workspace, for the whole course or for one class (batch), and can mark only students enrolled in that class of their own course; nobody else enters student attendance. Faculty see attendance for their assigned classes, the Principal, Admins and the Admin Manager for every course (**Student Attendance**), and students their own (**My Attendance**) once the register is submitted.

Admins, Faculty and students are notified in-app at each step.

## Security model

Every table has Row Level Security. Key rules:

- Inactive or pending accounts match no policy except their own profile.
- Students only see **published** courses they are enrolled in, and only **published** assignments/quizzes.
- Quiz answers (`questions.correct_index`) are never readable by students. Quizzes are served by `get_quiz_questions()` and scored by `submit_quiz()`.
- Course files live in a private `course-materials` bucket at `<course_id>/…` and are served via short-lived signed URLs.
- Role, status and email changes are blocked for non-admins by trigger.
- Changes to users, links, courses, enrolments, KPIs, alerts and settings are written to `audit_logs`.

## Project structure

```
supabase/
  migrations/
    20261005000001_schema.sql      tables, helper functions, workflow and audit triggers
    20261005000002_rls.sql         RLS policies and storage bucket and policies
    20261005000003_functions.sql   quiz, progress, analytics and KPI RPCs
    20261006000001/2_principal_*   principal role, approval rights and read access
    20261007000001/2_super_admin*  super admin and staff roles, user IDs, onboarding/offboarding, approval workflows
    20261008000001_operations.sql  timetable, attendance, invoices/payments, certificates
    20261009000001/2_admin_manager* admin manager role, applications, student records/documents, certificate lists
    20261013000001_finance.sql     student fees and staff salaries
    20261014000001_course_management.sql  course information and the Draft/Publish/Edit/Archive workflow
    20261015000001_student_enrollment.sql  course batches and enrollment requests approved by the Principal
    20261016000001_attendance.sql  staff and Faculty attendance, student registers by class
    20261017000001_assignment_management.sql  assigning to course/class/students, late submissions, submission status
  seed.sql                         categories, default KPIs, settings
scripts/seed.mjs                   demo users and sample course
public/zicon-logo.png              brand logo
src/
  styles/zicon-theme.css           Zicon colour tokens (light and dark)
  middleware.ts                    session refresh and auth redirect
  lib/                             supabase clients, auth guards, types, utils
  components/                      AppShell, UI kit, QuestionBank, CourseAnalytics, etc.
  app/
    (auth)/                        login, signup, reset-password
    (shared)/                      notifications, profile
    admin/  manager/  principal/  professor/  staff/  student/
```

## Setup

1. **Install**
   ```bash
   npm install
   cp .env.example .env    # then fill in values
   ```
   `.env` needs `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and, for seeding only, `SUPABASE_SERVICE_ROLE_KEY` (Supabase dashboard → Project Settings → API).

2. **Create the database.** Pick one:
   ```bash
   # Supabase CLI (use the session pooler, port 5432; URL-encode special chars in the password)
   supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
   ```
   Or paste each file in `supabase/migrations/` into the dashboard SQL Editor, in order, **one file per run** (enum migrations must commit before the next file uses them).

3. **Seed**
   - Run `supabase/seed.sql` in the SQL Editor (categories, KPIs, settings).
   - Demo accounts and sample data: `supabase db query --db-url "<connection string>" -f supabase/demo_seed.sql` (or `npm run seed` with a service role key).
   - The login page and landing page offer one-click demo sign-in. Set `DEMO_LOGIN_ENABLED=false` to hide it in a real deployment.

   | Role | Email | Password |
   |---|---|---|
   | Super Admin | superadmin@bigsms.demo | Demo@12345 |
   | Admin | admin@bigsms.demo | Demo@12345 |
| Admin Manager | manager@bigsms.demo | Demo@12345 |
   | Principal | principal@bigsms.demo | Demo@12345 |
   | Faculty | professor@bigsms.demo | Demo@12345 |
   | Student | student@bigsms.demo / student2@bigsms.demo | Demo@12345 |

4. **Auth settings.** In Supabase → Authentication → URL Configuration, add `http://localhost:3000/auth/callback` (and your production URL) to the redirect URLs for email confirmation and password reset.

5. **Run**
   ```bash
   npm run dev      # http://localhost:3000
   npm run build && npm start
   ```

## First real Super Admin

Sign up normally, then in the SQL Editor:

```sql
update public.profiles set role = 'super_admin', status = 'active' where email = 'you@example.com';
```

## KPI alerts

Admins define thresholds under **KPIs** (completion rate, average quiz score, submission rate, enrolled students). **Alerts → Run KPI check now** evaluates every published course, opens alerts for breaches and notifies the course Faculty. To run it on a schedule, call `select public.evaluate_kpis();` from a `pg_cron` job running as an admin context, or trigger it from an Edge Function.

## Principal approval scope

Course publication is done by the Principal or the Admin Manager (no separate approval chain). Extending it to other workflows is a BRD change (see the clarification log).
