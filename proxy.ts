export { auth as proxy } from "@/lib/auth";

export const config = {
  // Everything except Auth.js's own endpoints and static assets
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
