import Link from "next/link";
import { auth, isAdminEmail, signOut } from "@/lib/auth";
import { Logo } from "@/components/logo";
import Nav, { AccountMenu, AdminMenu } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = (await auth())?.user;
  const firstName = user?.name?.split(" ")[0];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-[1100] border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight" aria-label="Trip Finder home">
            <Logo />
            <span className="hidden md:inline">Trip Finder</span>
          </Link>
          <Nav />
          <div className="flex shrink-0 items-center gap-1">
            {isAdminEmail(user?.email) && <AdminMenu />}
            <AccountMenu
              name={firstName}
              signOut={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-3 pt-4 pb-16 sm:px-4 sm:pt-6">{children}</main>
    </div>
  );
}
