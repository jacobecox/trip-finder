import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false;
  const allowed = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
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

/** Defense in depth for API routes (the proxy already gates them). */
export async function requireUser() {
  const session = await auth();
  if (!session?.user || !isAllowedEmail(session.user.email)) return null;
  return session.user;
}
