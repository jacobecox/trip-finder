import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";

/** Admin-only pages send everyone else back to the trips list (their API routes also answer 403). */
export async function requireAdminPage() {
  if (!(await isAdmin())) redirect("/");
}
