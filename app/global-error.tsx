"use client";

import { ApplicationError } from "@/components/application-error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body><ApplicationError error={error} reset={reset} /></body>
    </html>
  );
}
