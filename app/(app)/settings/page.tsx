import { currentEmail, isAdminEmail } from "@/lib/auth";
import { getEffectiveSettings } from "@/lib/prefs";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const email = await currentEmail();
  const admin = isAdminEmail(email);
  const { settings, personalized } = await getEffectiveSettings(email);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          {admin
            ? "Trip cost and scoring here are also everyone else's defaults; the rest is shared and only you can change it."
            : "These only change what you see. Everyone else keeps their own."}
        </p>
      </div>
      <SettingsForm initial={settings} admin={admin} personalized={personalized} />
    </div>
  );
}
