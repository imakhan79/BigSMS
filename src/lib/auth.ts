import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_HOME, type PortalRole, type Profile, type Role } from "@/lib/types";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

/**
 * Ensures an active user with one of the given roles; redirects otherwise.
 * A Super Admin satisfies any "admin" requirement. Parent accounts no longer have access.
 */
export async function requireRole(...roles: PortalRole[]): Promise<Profile & { role: PortalRole }> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active" || profile.role === "parent") redirect("/pending");
  const allowed = roles.includes(profile.role) || (profile.role === "super_admin" && roles.includes("admin"));
  if (roles.length && !allowed) redirect(ROLE_HOME[profile.role]);
  return profile as Profile & { role: PortalRole };
}
