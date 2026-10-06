import Image from "next/image";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-fade-in text-center">
        <Image src="/zicon-logo.png" alt="Zicon" width={391} height={228} className="mx-auto h-16 w-auto rounded-md" />
        <p className="mt-8 text-sm font-semibold tabular-nums text-accent">404</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-primary">Page not found</h1>
        <p className="mt-3 text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist or may have been moved.</p>
        <LinkButton href="/" className="mt-7">Go to your dashboard</LinkButton>
      </div>
    </main>
  );
}
