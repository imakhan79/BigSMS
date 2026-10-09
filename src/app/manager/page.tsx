import { Award, FileText, GraduationCap, UserPlus, Wallet } from "lucide-react";
import { QuickActions } from "@/components/DashboardWidgets";
import { PageHeader, Stat } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { getCurrency } from "@/lib/office";
import { createClient } from "@/lib/supabase/server";
import { firstName, formatMoney } from "@/lib/utils";

export default async function ManagerDashboard() {
  const profile = await requireRole("admin_manager");
  const supabase = await createClient();
  const [{ count: openApps }, { count: students }, { count: faculty }, { count: staff }, { data: open }, { count: drafts }, { count: awaiting }, { count: rejected }, currency] =
    await Promise.all([
      supabase.from("student_applications").select("id", { count: "exact", head: true }).in("status", ["submitted", "under_review"]),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "student").eq("status", "active"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "professor").eq("status", "active"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "staff").eq("status", "active"),
      supabase.from("invoices").select("amount, amount_paid").in("status", ["unpaid", "partial"]),
      supabase.from("certificate_lists").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("certificate_lists").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      supabase.from("certificate_lists").select("id", { count: "exact", head: true }).eq("status", "rejected"),
      getCurrency(supabase),
    ]);
  const outstanding = (open ?? []).reduce((t, i) => t + Number(i.amount) - Number(i.amount_paid), 0);
  const name = firstName(profile.full_name);

  return (
    <>
      <PageHeader title={name ? `Welcome back, ${name}` : "Admin Manager"} subtitle="Admissions, student records, fees, enrollment and certificate lists" />
      <QuickActions
        actions={[
          { href: "/manager/applications", label: "Applications", description: `${openApps ?? 0} open`, icon: <FileText size={17} /> },
          { href: "/manager/enrollment", label: "Course enrollment", description: "Enrol students in courses", icon: <UserPlus size={17} /> },
          { href: "/finance/fees", label: "Fee records", description: `${formatMoney(outstanding, currency)} outstanding`, icon: <Wallet size={17} /> },
          { href: "/manager/certificates", label: "Certificate lists", description: `${awaiting ?? 0} awaiting the Principal`, icon: <Award size={17} /> },
        ]}
      />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Open applications" value={openApps ?? 0} href="/manager/applications" icon={<FileText size={16} />} />
        <Stat label="Active students" value={students ?? 0} href="/manager/students" icon={<GraduationCap size={16} />} />
        <Stat label="Faculty" value={faculty ?? 0} href="/manager/faculty" />
        <Stat label="Staff" value={staff ?? 0} href="/manager/staff" />
        <Stat label="Outstanding fees" value={formatMoney(outstanding, currency)} hint={`${open?.length ?? 0} open invoices`} href="/finance/fees?status=open" />
        <Stat label="Draft certificate lists" value={drafts ?? 0} href="/manager/certificates" />
        <Stat label="Awaiting Principal" value={awaiting ?? 0} href="/manager/certificates" />
        <Stat label="Returned by Principal" value={rejected ?? 0} hint="need changes" href="/manager/certificates" />
      </div>
    </>
  );
}
