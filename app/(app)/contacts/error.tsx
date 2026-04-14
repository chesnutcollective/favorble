"use client";

import { Button } from "@/components/ui/button";

export default function ContactsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <svg
          className="h-8 w-8 text-destructive"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">
        Something went wrong
      </h2>
      <p className="mt-1 text-sm text-muted-foreground max-w-md">
        An unexpected error occurred. Please try again, or contact support if
        the problem persists.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground font-mono">
          Error ID: {error.digest}
        </p>
      )}
      <Button onClick={reset} className="mt-6" size="sm">
        Try Again
      </Button>
    </div>
  );
}
