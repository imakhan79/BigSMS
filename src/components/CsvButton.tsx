"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui";

export function CsvButton({ filename, rows }: { filename: string; rows: Record<string, unknown>[] }) {
  const download = () => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button variant="outline" onClick={download} disabled={!rows.length}>
      <Download size={16} /> Export CSV
    </Button>
  );
}
