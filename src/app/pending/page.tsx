import Image from "next/image";
import { redirect } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui";
import { getProfile } from "@/lib/auth";

export default async function PendingPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status === "active") redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in rounded-lg border border-border bg-surface p-8 text-center shadow-xs">
        <Image src="/zicon-logo.png" alt="Zicon" width={160} height={92} className="mx-auto mb-6 h-16 w-auto rounded-md" />
        <h1 className="text-xl font-semibold text-foreground">
          {profile.status === "offboarded" ? "Account closed" : profile.status === "inactive" ? "Account deactivated" : "Awaiting activation"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile.status === "offboarded"
            ? "You have been offboarded and no longer have access. Contact an administrator if this is a mistake."
            : profile.status === "inactive"
            ? "Your account has been deactivated. Contact an administrator."
            : "An administrator needs to activate your account before you can use the system."}
        </p>
        <form action={signOut} className="mt-6">
          <Button variant="outline">Sign out</Button>
        </form>
      </div>
    </div>
  );
}
