import { redirect } from "next/navigation";

/** Enrollment moved to the shared Student enrollment section (Principal approval). */
export default function EnrollmentMoved() {
  redirect("/enrollment");
}
