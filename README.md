# Big SMS

Learning management system by Zicon, with portals for **Super Admin**, **Admin**, **Admin Manager**, **Principal**, **Professor**, **Staff**, **Student** and **Parent**.

Built with Next.js 15 (App Router, TypeScript, Server Actions), Supabase (Postgres, Auth, Storage, RLS) and Tailwind CSS using the Zicon brand colours.

## Roles

| Role | Can do |
|---|---|
| **Super Admin** | Everything Admin can, plus: create and manage Admin/Super Admin accounts, edit user IDs, and configure approval workflows (e.g. Admin → Principal) under **Approval Workflows**. Can decide on a course at any approval step; approving as Super Admin publishes immediately. |
| **Admin** | Create, onboard and offboard non-administrator users, assign categories (roles), link parents to students, approve/reject/archive courses, manage categories, question bank, KPI configuration, alert management, reports & analytics (CSV export), audit logs, system settings |
| **Admin Manager** | Reads faculty, staff, student and student fee details. Manages student applications (online form at `/apply` and walk-ins; accepting creates the student account), student information and documents, fee invoices and payment records, and course enrollment. Compiles the list of students eligible for certificates and submits it to the Principal. Cannot change other roles, offboard students or reverse payments. |
| **Principal** | Approve or reject certificate lists prepared by the Admin Manager. Approve or reject courses submitted by professors; read-only oversight of all courses, content, student progress, reports & analytics and KPI alerts. Assigned by an admin only. |
| **Professor** | Create/edit/categorise courses, submit for approval, archive; lectures; upload videos, PDFs, books, notes, worksheets; assignments and grading; quizzes built from the question bank; assign students; monitor progress; analytics; KPI notifications |
| **Staff** | Staff portal with their details and notifications (staff modules to follow). |
| **Student** | View assigned (published) courses and outlines, lectures and materials, mark lectures complete, submit assignments, take quizzes (one attempt, graded server-side) |
| **Parent** | Read-only view of linked children: courses, progress, published assignments with grades/feedback, quiz scores |

## Approval workflows

1. **Account activation**: self-registered users start as `pending` and can do nothing until an admin sets them `active`. Admin role can never be self-assigned.
2. **Course approval**: `draft` → (professor submits) → `pending_approval` → each configured approval step in order (default: **Principal**; the Super Admin can set e.g. Admin → Principal) → `published`, or `rejected` (with note) at any step. Decisions go through `review_course()` and are kept in `course_approvals`. A rejected course can be edited and resubmitted. Professors may withdraw a submission or archive. Admins and principals may only decide on courses at their own step; principals cannot edit content. Only admins archive or restore. Enforced by the `guard_course_update` trigger, so it holds even when the API is called directly.
3. **Onboarding / offboarding**: activating an account onboards it and assigns a unique user ID by category (SA, ADM, PRN, FAC, STF, STU, PAR, e.g. `STU-0001`). Offboarding (with a reason) ends access and keeps all records; the user can be re-onboarded.
4. **Certificates: Prepared by Admin Manager → Approved by Principal.** The Admin Manager compiles a list (optionally for one course; completion, attendance and unpaid fees are computed by the server) and submits it. The Principal approves, which issues a numbered certificate to every student on the list, or returns it with a note for changes and resubmission. The preparer cannot approve their own list. Certificates cannot be created any other way.
5. **Grading**: students submit/resubmit until graded; only the course professor can grade; graded work is locked.

Admins, professors and students are notified in-app at each step.

## Security model

Every table has Row Level Security. Key rules:

- Inactive or pending accounts match no policy except their own profile.
- Students only see **published** courses they are enrolled in, and only **published** assignments/quizzes.
- Quiz answers (`questions.correct_index`) are never readable by students or parents. Quizzes are served by `get_quiz_questions()` and scored by `submit_quiz()`.
- Parents see only what their linked child sees (`is_parent_of`, `parent_sees_course`). They get no materials, no question bank and no other students.
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
    admin/  principal/  professor/  student/  parent/
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
   | Professor | professor@bigsms.demo | Demo@12345 |
   | Student | student@bigsms.demo / student2@bigsms.demo | Demo@12345 |
   | Parent | parent@bigsms.demo (linked to student1) | Demo@12345 |

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

Admins define thresholds under **KPIs** (completion rate, average quiz score, submission rate, enrolled students). **Alerts → Run KPI check now** evaluates every published course, opens alerts for breaches and notifies the course professor. To run it on a schedule, call `select public.evaluate_kpis();` from a `pg_cron` job running as an admin context, or trigger it from an Edge Function.

## Principal approval scope

Principal approval applies only where defined: **course publication**. Extending it to other workflows is a BRD change (see the clarification log).
