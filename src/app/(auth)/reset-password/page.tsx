import Link from "next/link";
import { requestPasswordReset } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, Input, Label, type FlashParams } from "@/components/ui";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-primary">Reset password</h1>
      <Flash params={params} />
      <form action={requestPasswordReset} className="space-y-4">
        <Label label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Label>
        <SubmitButton className="w-full">Send reset link</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
      </p>
    </>
  );
}
