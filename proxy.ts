export { auth as proxy } from "@/lib/auth";

export const config = {
  // Everything except Auth.js's own endpoints, the secret-protected email/cron webhooks, and static assets
  matcher: ["/((?!api/auth|api/ingest|api/cron|_next/static|_next/image|icon.svg|apple-icon|manifest.webmanifest|icons/).*)"],
};
