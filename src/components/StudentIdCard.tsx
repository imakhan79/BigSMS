import { UserRound } from "lucide-react";
import { BRAND, Crest } from "@/components/Brand";
import { PrintButton } from "@/components/PrintButton";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/utils";

/**
 * The student ID card, built from the student record. The photo is the latest photograph
 * in the student's documents (a verified one if there is one). Row Level Security decides
 * who may see it: the student office, the student and their parents.
 */
export async function StudentIdCard({ studentId }: { studentId: string }) {
  const supabase = await createClient();
  const [{ data: student }, { data: record }, { data: photos }] = await Promise.all([
    supabase.from("profiles").select("full_name, user_code, status").eq("id", studentId).maybeSingle(),
    supabase.from("student_records").select("program, admitted_on, guardian_phone").eq("student_id", studentId).maybeSingle(),
    supabase
      .from("student_documents")
      .select("file_path, status, mime_type")
      .eq("student_id", studentId)
      .eq("doc_type", "photo")
      .neq("status", "rejected")
      .like("mime_type", "image/%")
      .order("created_at", { ascending: false }),
  ]);
  if (!student) return null;
  const photo = photos?.find((p) => p.status === "verified") ?? photos?.[0];
  const photoUrl = photo
    ? (await supabase.storage.from("student-documents").createSignedUrl(photo.file_path, 60 * 10)).data?.signedUrl
    : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end print:hidden"><PrintButton /></div>
      <div className="mx-auto w-[340px] overflow-hidden rounded-xl border border-border bg-surface shadow-xs print:shadow-none">
        <div className="flex items-center gap-3 bg-primary px-4 py-3 text-white">
          <Crest className="h-10" />
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">{BRAND.short}</p>
            <p className="truncate text-[10px] leading-tight opacity-80">{BRAND.name}</p>
          </div>
        </div>
        <div className="flex gap-4 p-4">
          <div className="flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={`Photograph of ${student.full_name}`} className="h-full w-full object-cover" />
            ) : (
              <UserRound size={36} className="text-muted-foreground" aria-label="No photograph on file" />
            )}
          </div>
          <dl className="min-w-0 space-y-1.5 text-xs">
            <div><dt className="text-muted-foreground">Name</dt><dd className="text-sm font-semibold">{student.full_name}</dd></div>
            <div><dt className="text-muted-foreground">Student ID</dt><dd className="font-mono text-sm font-semibold">{student.user_code ?? "—"}</dd></div>
            <div><dt className="text-muted-foreground">Programme</dt><dd className="font-medium">{record?.program || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Admitted</dt><dd className="font-medium">{formatDay(record?.admitted_on)}</dd></div>
          </dl>
        </div>
        <div className="flex items-center justify-between border-t-2 border-gold px-4 py-2 text-[10px] text-muted-foreground">
          <span>Emergency: {record?.guardian_phone || "—"}</span>
          <span className="font-semibold uppercase tracking-wider">Student</span>
        </div>
      </div>
      {!photoUrl && <p className="text-center text-xs text-muted-foreground print:hidden">No photograph on file. The student office adds it under Documents.</p>}
      {student.status !== "active" && <p className="text-center text-xs font-medium text-danger">This student account is not active.</p>}
    </div>
  );
}
