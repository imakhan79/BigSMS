import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/types";

export default async function Home() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/pending");
  redirect(ROLE_HOME[profile.role]);
}
