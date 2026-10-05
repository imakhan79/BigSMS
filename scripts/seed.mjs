// Seeds demo users and a sample course. Requires SUPABASE_SERVICE_ROLE_KEY in .env.
// Usage: npm run seed   (safe to re-run; existing demo users are reused)
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const PASSWORD = process.env.SEED_PASSWORD ?? "Demo@12345";

const USERS = [
  { email: "admin@bigsms.demo", full_name: "Aisha Admin", role: "admin" },
  { email: "professor@bigsms.demo", full_name: "Dr. Omar Professor", role: "professor" },
  { email: "student@bigsms.demo", full_name: "Sara Student", role: "student" },
  { email: "student2@bigsms.demo", full_name: "Bilal Student", role: "student" },
  { email: "parent@bigsms.demo", full_name: "Hina Parent", role: "parent" },
];

function check(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function ensureUser({ email, full_name, role }) {
  const existing = check(await db.from("profiles").select("id").eq("email", email).maybeSingle(), `find ${email}`);
  let id = existing?.id;
  if (!id) {
    const created = check(
      await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name } }),
      `create ${email}`,
    );
    id = created.user.id;
  }
  // Role/status are admin-controlled; the service role sets them directly.
  check(await db.from("profiles").update({ full_name, role, status: "active" }).eq("id", id), `activate ${email}`);
  return id;
}

const ids = {};
for (const u of USERS) ids[u.role === "student" ? u.email.split("@")[0] : u.role] = await ensureUser(u);
console.log("Users ready");

check(await db.from("parent_students").upsert({ parent_id: ids.parent, student_id: ids.student1 }), "link parent");

const category = check(
  await db.from("course_categories").upsert({ name: "Computer Science" }, { onConflict: "name" }).select("id").single(),
  "category",
);

let course = check(await db.from("courses").select("id").eq("title", "Introduction to Programming").maybeSingle(), "find course");
if (!course) {
  course = check(
    await db
      .from("courses")
      .insert({
        professor_id: ids.professor,
        category_id: category.id,
        title: "Introduction to Programming",
        description: "Fundamentals of programming with Python: variables, control flow, functions and data structures.",
        outline: "Week 1: Variables and types\nWeek 2: Control flow\nWeek 3: Functions\nWeek 4: Lists and dictionaries",
        status: "published",
      })
      .select("id")
      .single(),
    "course",
  );

  check(
    await db.from("lectures").insert([
      { course_id: course.id, position: 1, title: "Variables and types", content: "Numbers, strings, booleans and how Python stores values." },
      { course_id: course.id, position: 2, title: "Control flow", content: "if/elif/else, for and while loops." },
      { course_id: course.id, position: 3, title: "Functions", content: "Defining functions, parameters and return values." },
    ]),
    "lectures",
  );
  check(
    await db.from("materials").insert({
      course_id: course.id,
      type: "video",
      title: "Python in 10 minutes",
      external_url: "https://www.youtube.com/results?search_query=python+basics",
    }),
    "materials",
  );
  check(
    await db.from("assignments").insert({
      course_id: course.id,
      title: "FizzBuzz",
      instructions: "Write a program that prints numbers 1–100, replacing multiples of 3 with Fizz, 5 with Buzz and both with FizzBuzz.",
      max_score: 20,
      published: true,
      due_at: new Date(Date.now() + 7 * 864e5).toISOString(),
    }),
    "assignment",
  );

  const questions = check(
    await db
      .from("questions")
      .insert([
        { created_by: ids.professor, category_id: category.id, prompt: "Which keyword defines a function in Python?", options: ["func", "def", "function", "lambda"], correct_index: 1, difficulty: "easy" },
        { created_by: ids.professor, category_id: category.id, prompt: "What does len([1, 2, 3]) return?", options: ["2", "3", "4", "Error"], correct_index: 1, difficulty: "easy" },
        { created_by: ids.professor, category_id: category.id, prompt: "Which type is immutable?", options: ["list", "dict", "tuple", "set"], correct_index: 2, difficulty: "medium" },
      ])
      .select("id"),
    "questions",
  );
  const quiz = check(
    await db.from("quizzes").insert({ course_id: course.id, title: "Basics check", description: "Three quick questions.", published: true }).select("id").single(),
    "quiz",
  );
  check(await db.from("quiz_questions").insert(questions.map((q, i) => ({ quiz_id: quiz.id, question_id: q.id, position: i }))), "quiz questions");

  check(
    await db.from("enrollments").insert([
      { course_id: course.id, student_id: ids.student1 },
      { course_id: course.id, student_id: ids.student2 },
    ]),
    "enrollments",
  );
}

// A draft waiting in the approval queue
const pending = check(await db.from("courses").select("id").eq("title", "Linear Algebra").maybeSingle(), "find draft");
if (!pending) {
  check(
    await db.from("courses").insert({
      professor_id: ids.professor,
      title: "Linear Algebra",
      description: "Vectors, matrices and linear transformations.",
      status: "pending_approval",
    }),
    "pending course",
  );
}

console.log(`\nSeed complete. All demo accounts use password: ${PASSWORD}`);
for (const u of USERS) console.log(`  ${u.role.padEnd(10)} ${u.email}`);
