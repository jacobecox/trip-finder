import { requireAdminPage } from "@/lib/admin-page";
import { getSettings } from "@/lib/queries";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted">These apply to everyone&apos;s view of the trips.</p>
      </div>
      <SettingsForm initial={s} />
    </div>
  );
}
