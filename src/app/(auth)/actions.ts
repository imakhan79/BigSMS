"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { back, str } from "@/lib/utils";

async function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function signIn(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: str(form, "email"),
    password: str(form, "password"),
  });
  if (error) back("/login", "error", error.message);
  redirect("/");
}

export async function signUp(form: FormData) {
  const role = str(form, "role");
  if (!["student", "professor", "parent"].includes(role)) back("/signup", "error", "Choose a valid role.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: str(form, "email"),
    password: str(form, "password"),
    options: {
      data: { full_name: str(form, "full_name"), role },
      emailRedirectTo: `${await siteUrl()}/auth/callback`,
    },
  });
  if (error) back("/signup", "error", error.message);
  back("/login", "ok", "Account created. Confirm your email if asked, then wait for an administrator to activate your account.");
}

export async function requestPasswordReset(form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(str(form, "email"), {
    redirectTo: `${await siteUrl()}/auth/callback?next=/profile`,
  });
  if (error) back("/reset-password", "error", error.message);
  back("/reset-password", "ok", "If that email exists, a reset link is on its way. The link signs you in so you can set a new password on your profile page.");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
