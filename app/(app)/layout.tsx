import Link from "next/link";
import { auth, isAdminEmail, signOut } from "@/lib/auth";
import { SubmitButton } from "@/components/ui";
import { Logo } from "@/components/logo";
import Nav from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = (await auth())?.user;
  const firstName = user?.name?.split(" ")[0];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1100] border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span className="hidden sm:inline">Trip Finder</span>
          </Link>
          <Nav admin={isAdminEmail(user?.email)} />
          <form
            className="flex shrink-0 items-center gap-2"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            {firstName && <span className="hidden text-sm text-muted md:inline">Hi, {firstName}</span>}
            <SubmitButton className="btn btn-ghost px-2">Sign out</SubmitButton>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-16">{children}</main>
    </div>
  );
}
