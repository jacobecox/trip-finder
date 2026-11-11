/** Yellow plane badge used in the header and on the sign-in page. */
export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-lg bg-accent text-accent-ink ${className}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
      </svg>
    </span>
  );
}
