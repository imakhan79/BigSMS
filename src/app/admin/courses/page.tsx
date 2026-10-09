import { redirect } from "next/navigation";

/** Courses moved to the shared Course management section. */
export default function CoursesMoved() {
  redirect("/courses");
}
