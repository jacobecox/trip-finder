import { NextResponse } from "next/server";
import { isAdminEmail, requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/queries";
import { diffPrefs, getEffectiveSettings, PrefsBody, savePrefs } from "@/lib/prefs";

/** A family member's own tickets/weights/costs. The admin's choices are the shared settings instead. */
export async function PUT(req: Request) {
  const user = await requireUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (isAdminEmail(user.email)) return NextResponse.json({ error: "Use the shared settings" }, { status: 400 });
  const parsed = PrefsBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await savePrefs(user.email, diffPrefs(await getSettings(), parsed.data));
  return NextResponse.json((await getEffectiveSettings(user.email)).settings);
}

/** Back to the shared defaults. */
export async function DELETE() {
  const user = await requireUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await savePrefs(user.email, {});
  return NextResponse.json(await getSettings());
}
