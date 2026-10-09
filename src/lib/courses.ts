import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrency } from "@/lib/office";
import type { Course } from "@/lib/types";

/**
 * Course stages: Draft → Publish → Edit → Archive. "Edit" is a published course with unpublished
 * changes (status published, editing on, changes in course_edits); students keep the published version.
 */
export type CourseStage = "draft" | "published" | "edit" | "archived";

export const COURSE_STAGES: CourseStage[] = ["draft", "published", "edit", "archived"];

export const STAGE_LABEL: Record<CourseStage, string> = {
  draft: "Draft",
  published: "Published",
  edit: "Edit",
  archived: "Archived",
};

export const DURATION_UNITS = ["days", "weeks", "months", "years"] as const;

/** The editable course information (what course_edits.changes holds). */
export type CourseInfo = Pick<
  Course,
  "title" | "code" | "description" | "outline" | "curriculum" | "duration_value" | "duration_unit" | "fee" | "category_id" | "professor_id"
>;

export function courseStage(c: Pick<Course, "status" | "editing">): CourseStage {
  if (c.status === "published" && c.editing) return "edit";
  return c.status;
}

/** Unpublished changes to a course, if it is in the Edit stage. Students cannot read these. */
export async function courseChanges(supabase: SupabaseClient, course: Pick<Course, "id" | "editing">): Promise<Partial<CourseInfo> | null> {
  if (!course.editing) return null;
  const { data } = await supabase.from("course_edits").select("changes").eq("course_id", course.id).maybeSingle();
  return (data?.changes as Partial<CourseInfo>) ?? null;
}

/** What an editor works on: the unpublished changes when there are any, otherwise the course as stored. */
export function workingCopy<T extends Course>(c: T, changes: Partial<CourseInfo> | null): T {
  return changes ? { ...c, ...changes } : c;
}

/** Narrow a courses query to one stage. */
export function filterStage<Q>(builder: Q, stage: string | undefined): Q {
  const query = builder as any;
  switch (stage) {
    case "draft":
    case "archived":
      return query.eq("status", stage);
    case "published":
      return query.eq("status", "published").eq("editing", false);
    case "edit":
      return query.eq("status", "published").eq("editing", true);
    case "ready":
      return query.not("ready_at", "is", null);
    default:
      return query;
  }
}

export function formatDuration(value: number | null | undefined, unit: string | null | undefined) {
  if (!value) return "—";
  const u = unit || "weeks";
  return `${value} ${value === 1 ? u.replace(/s$/, "") : u}`;
}

/** Labels of the fields that differ between the published course and its unpublished changes. */
export function changedFields(c: Course, changes: Partial<CourseInfo> | null): string[] {
  if (!changes) return [];
  const keys = (Object.keys(changes) as (keyof CourseInfo)[]).filter((k) => String(changes[k] ?? "") !== String(c[k] ?? ""));
  return [...new Set(keys.map((k) => FIELD_LABEL[k]))];
}

export const FIELD_LABEL: Record<keyof CourseInfo, string> = {
  title: "Course name",
  code: "Course ID",
  description: "Description",
  outline: "Outline",
  curriculum: "Curriculum",
  duration_value: "Duration",
  duration_unit: "Duration",
  fee: "Fee",
  category_id: "Category",
  professor_id: "Faculty",
};

/** Categories, active Faculty and the currency, for the course form. */
export async function courseFormOptions(supabase: SupabaseClient) {
  const [{ data: categories }, { data: faculty }, currency] = await Promise.all([
    supabase.from("course_categories").select("id, name").order("name"),
    supabase.from("profiles").select("id, full_name, user_code").eq("role", "professor").eq("status", "active").order("full_name"),
    getCurrency(supabase),
  ]);
  return {
    categories: categories ?? [],
    faculty: (faculty ?? []).map((f) => ({ id: f.id, name: [f.full_name, f.user_code].filter(Boolean).join(" · ") })),
    currency,
  };
}
