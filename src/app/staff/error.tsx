"use client";

import { ErrorState } from "@/components/ErrorState";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState error={error} reset={reset} home="/staff" />;
}
