import { BookOpenCheck, GraduationCap, Landmark, ShieldCheck, Users } from "lucide-react";
import { demoSignIn } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";

export const DEMO_ROLES = [
  { role: "admin", label: "Admin", hint: "Approvals, users, KPIs", Icon: ShieldCheck },
  { role: "principal", label: "Principal", hint: "Course approvals, oversight", Icon: Landmark },
  { role: "professor", label: "Professor", hint: "Courses, grading, quizzes", Icon: BookOpenCheck },
  { role: "student", label: "Student", hint: "Lectures, assignments", Icon: GraduationCap },
  { role: "parent", label: "Parent", hint: "Child's progress", Icon: Users },
] as const;

/** One-click sign-in buttons for the seeded demo accounts. */
export function DemoLogin({ compact = false }: { compact?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DEMO_ROLES.map(({ role, label, hint, Icon }) => (
        <form key={role} action={demoSignIn} className="last:odd:col-span-2">
          <input type="hidden" name="role" value={role} />
          <SubmitButton
            variant="outline"
            className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal px-3 py-3 text-left hover:border-accent"
          >
            <span className="flex items-center gap-2 font-semibold text-primary">
              <Icon size={16} className="text-accent" /> {label}
            </span>
            {!compact && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
          </SubmitButton>
        </form>
      ))}
    </div>
  );
}
