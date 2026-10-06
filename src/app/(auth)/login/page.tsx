import Link from "next/link";
import { signIn } from "@/app/(auth)/actions";
import { DemoLogin } from "@/components/DemoLogin";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, Input, Label, type FlashParams } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  const demoEnabled = process.env.DEMO_LOGIN_ENABLED !== "false";

  return (
    <>
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome back</h1>
      <p className="mb-6 text-sm text-muted-foreground">Sign in to Big SMS</p>
      <Flash params={params} />

      {demoEnabled && (
        <section id="demo" className="mb-6" aria-labelledby="demo-heading">
          <h2 id="demo-heading" className="mb-2 text-sm font-semibold">
            Try a demo: one click, no password
          </h2>
          <DemoLogin />
        </section>
      )}

      {demoEnabled && (
        <div className="mb-6 flex items-center gap-3 text-xs uppercase text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> or sign in with email <span className="h-px flex-1 bg-border" />
        </div>
      )}

      <form action={signIn} className="space-y-4">
        <Label label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Label>
        <Label label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Label>
        <SubmitButton className="w-full">Sign in</SubmitButton>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <Link href="/reset-password" className="text-primary hover:underline">Forgot password?</Link>
        <Link href="/signup" className="text-primary hover:underline">Create account</Link>
      </div>
    </>
  );
}
