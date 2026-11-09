import Link from "next/link";
import { signOut } from "@/lib/auth";

const links = [
  { href: "/", label: "Listings" },
  { href: "/upload", label: "Upload" },
  { href: "/properties", label: "Properties" },
  { href: "/settings", label: "Settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-12">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-black/10 py-3 dark:border-white/15">
        <span className="font-semibold">Trip Finder</span>
        <nav className="flex flex-1 flex-wrap gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="text-sm text-black/60 hover:underline dark:text-white/60">Sign out</button>
        </form>
      </header>
      <main className="pt-6">{children}</main>
    </div>
  );
}
