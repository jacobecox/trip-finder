"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MAIN = [
  { href: "/", label: "Trips" },
  { href: "/settings", label: "Settings" },
  { href: "/guide", label: "How it works" },
];
const ADMIN = [
  { href: "/upload", label: "Upload" },
  { href: "/properties", label: "Resorts" },
];

export default function Nav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const item = (l: { href: string; label: string }) => {
    const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={active ? "page" : undefined}
        className={`rounded-lg px-2.5 py-1.5 whitespace-nowrap transition-colors ${
          active ? "bg-accent/15 text-accent" : "text-muted hover:bg-white/5 hover:text-ink"
        }`}
      >
        {l.label}
      </Link>
    );
  };
  return (
    <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto text-sm">
      {MAIN.map(item)}
      {admin && (
        <>
          <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
          <span className="label mr-0.5 hidden sm:inline" title="Only you can see these">
            Admin
          </span>
          {ADMIN.map(item)}
        </>
      )}
    </nav>
  );
}
