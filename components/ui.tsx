"use client";

import { useFormStatus } from "react-dom";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** A form submit button that shows a spinner while its server action runs. */
export function SubmitButton({ children, className = "btn btn-primary" }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending} aria-busy={pending}>
      {pending && <Spinner />}
      {children}
    </button>
  );
}

/** Small "i" with a hover/focus explanation, for family members new to the app. */
export function Hint({ children }: { children: string }) {
  return (
    <span
      tabIndex={0}
      title={children}
      aria-label={children}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line align-middle text-[10px] text-muted hover:border-accent hover:text-accent"
    >
      i
    </span>
  );
}
