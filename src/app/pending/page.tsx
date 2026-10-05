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
    <div className="flex min-h-screen items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background p-8 text-center shadow-lg">
        <Image src="/zicon-logo.png" alt="Zicon" width={160} height={92} className="mx-auto mb-4 h-auto w-40 rounded" />
        <h1 className="text-xl font-bold text-primary">
          {profile.status === "inactive" ? "Account deactivated" : "Awaiting activation"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {profile.status === "inactive"
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
