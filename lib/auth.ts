import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const emailList = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** ALLOWED_EMAILS: everyone who can sign in and browse (family). */
export function isAllowedEmail(email?: string | null): boolean {
  return !!email && emailList(process.env.ALLOWED_EMAILS).includes(email.toLowerCase());
}

/**
 * ADMIN_EMAILS: who can upload PDFs, edit properties and settings, and spend flight searches.
 * Must also be allowed to sign in. Unset means nobody is admin (fails closed).
 */
export function isAdminEmail(email?: string | null): boolean {
  return isAllowedEmail(email) && emailList(process.env.ADMIN_EMAILS).includes(email!.toLowerCase());
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    signIn({ profile }) {
      // Google must have verified the address before we trust it for the allowlist
      return profile?.email_verified !== false && isAllowedEmail(profile?.email);
    },
    authorized({ auth, request }) {
      if (request.nextUrl.pathname === "/login") return true;
      return !!auth?.user && isAllowedEmail(auth.user.email);
    },
  },
});

/** Defense in depth for API routes (the proxy already gates sign-in). */
export async function requireUser() {
  const session = await auth();
  if (!session?.user || !isAllowedEmail(session.user.email)) return null;
  return session.user;
}

/** For routes that change data or spend API quota. */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || !isAdminEmail(session.user.email)) return null;
  return session.user;
}

/** Whether the signed-in user is an admin (for showing admin-only UI). */
export async function isAdmin() {
  return isAdminEmail((await auth())?.user?.email);
}

export async function currentEmail() {
  return (await auth())?.user?.email ?? null;
}
