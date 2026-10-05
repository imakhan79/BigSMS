import Link from "next/link";
import { signIn } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, Input, Label, type FlashParams } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-primary">Sign in</h1>
      <Flash params={params} />
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
