import Link from "next/link";
import { submitApplication } from "@/app/apply/actions";
import { PersonFields } from "@/app/manager/_components";
import { BrandLockup } from "@/components/Brand";
import { SubmitButton } from "@/components/SubmitButton";
import { Alert, Card, Flash, type FlashParams, Input, Label } from "@/components/ui";

export const metadata = { title: "Apply for admission" };

export default async function ApplyPage({ searchParams }: { searchParams: Promise<FlashParams & { no?: string }> }) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="mb-8 inline-block"><BrandLockup sub="Admissions" /></Link>
      <h1 className="font-display text-3xl font-semibold text-primary">Apply for admission</h1>
      <p className="mt-1 text-sm text-muted-foreground">The admissions office reviews every application and contacts you by email.</p>
      <div className="mt-6">
        {params.no ? (
          <Alert tone="success" title={`Application ${params.no} received`}>
            Keep this number for your records. We will email you once your application has been reviewed.
          </Alert>
        ) : (
          <>
            <Flash params={params} />
            <Card>
              <form action={submitApplication} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Label label="Applicant full name"><Input name="full_name" required maxLength={120} /></Label>
                <Label label="Email"><Input name="email" type="email" required maxLength={200} /></Label>
                <Label label="Phone"><Input name="phone" type="tel" maxLength={40} /></Label>
                <PersonFields withStatement />
                <div className="sm:col-span-2 lg:col-span-3"><SubmitButton>Submit application</SubmitButton></div>
              </form>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
