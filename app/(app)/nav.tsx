"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SubmitButton } from "@/components/ui";

const MAIN = [
  { href: "/", label: "Trips" },
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "How it works", short: "Guide" },
];
const ADMIN = [
  { href: "/upload", label: "Upload", hint: "Add a new availability PDF" },
  { href: "/properties", label: "Resorts", hint: "Fix locations, activities and airports" },
];

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path.startsWith(href));

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-sm sm:gap-1">
      {MAIN.map((l) => {
        const active = isActive(path, l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-ink"
            }`}
          >
            {l.short ? (
              <>
                <span className="sm:hidden">{l.short}</span>
                <span className="hidden sm:inline">{l.label}</span>
              </>
            ) : (
              l.label
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** Small click-to-open menu that closes on outside click, Escape, or navigation. */
function Menu({
  button,
  label,
  active,
  children,
}: {
  button: React.ReactNode;
  label: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close after client-side navigation
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`btn h-9 gap-1 px-2.5 ${active || open ? "bg-accent/15 text-accent" : "btn-ghost"}`}
      >
        {button}
      </button>
      {open && (
        <div
          role="menu"
          className="card absolute top-full right-0 z-10 mt-2 w-60 overflow-hidden p-1 shadow-2xl shadow-black/50"
        >
          {children}
        </div>
      )}
    </div>
  );
}

const chevron = (
  <svg viewBox="0 0 20 20" className="h-4 w-4 opacity-70" fill="currentColor" aria-hidden="true">
    <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4z" />
  </svg>
);

export function AdminMenu() {
  const path = usePathname();
  return (
    <Menu label="Admin tools" active={ADMIN.some((l) => isActive(path, l.href))} button={<>Admin{chevron}</>}>
      <p className="label px-3 pt-2 pb-1">Only you see these</p>
      {ADMIN.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          role="menuitem"
          className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/5 ${
            isActive(path, l.href) ? "text-accent" : ""
          }`}
        >
          {l.label}
          <span className="block text-xs text-muted">{l.hint}</span>
        </Link>
      ))}
    </Menu>
  );
}

export function AccountMenu({ name, signOut }: { name?: string; signOut: () => Promise<void> }) {
  return (
    <Menu
      label="Account"
      button={
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-sm font-semibold text-ink">
          {name?.[0]?.toUpperCase() ?? "?"}
        </span>
      }
    >
      {name && <p className="px-3 pt-2 pb-1 text-sm text-muted">Signed in as {name}</p>}
      <form action={signOut}>
        <SubmitButton className="block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-white/5">
          Sign out
        </SubmitButton>
      </form>
    </Menu>
  );
}
