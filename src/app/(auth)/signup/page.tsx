import Link from "next/link";
import { signUp } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Flash, Input, Label, Select, type FlashParams } from "@/components/ui";

export default async function SignupPage({ searchParams }: { searchParams: Promise<FlashParams> }) {
  const params = await searchParams;
  return (
    <>
      <h1 className="mb-1 text-xl font-semibold text-foreground">Create account</h1>
      <p className="mb-4 text-sm text-muted-foreground">New accounts are activated by an administrator.</p>
      <Flash params={params} />
      <form action={signUp} className="space-y-4">
        <Label label="Full name">
          <Input name="full_name" required />
        </Label>
        <Label label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Label>
        <Label label="Password">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Label>
        <Label label="I am a">
          <Select name="role" defaultValue="student">
            <option value="student">Student</option>
            <option value="professor">Professor</option>
            <option value="parent">Parent</option>
          </Select>
        </Label>
        <SubmitButton className="w-full">Create account</SubmitButton>
      </form>
      <p className="mt-4 text-center text-sm">
        Already registered? <Link href="/login" className="text-primary hover:underline">Sign in</Link>
      </p>
    </>
  );
}
