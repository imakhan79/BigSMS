import { ExternalLink, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

/** Renders a material as a link: external URL, or a short-lived signed URL for private storage files. */
export async function MaterialLink({ material }: { material: { title: string; file_path: string | null; external_url: string | null } }) {
  let href = material.external_url;
  if (material.file_path) {
    const supabase = await createClient();
    const { data } = await supabase.storage.from("course-materials").createSignedUrl(material.file_path, 60 * 60);
    href = data?.signedUrl ?? null;
  }
  if (!href) return <span>{material.title}</span>;
  const Icon = material.file_path ? FileText : ExternalLink;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
      <Icon size={14} /> {material.title}
    </a>
  );
}
