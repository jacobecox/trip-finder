import { getSettings } from "@/lib/queries";
import SettingsForm from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      <SettingsForm initial={s} />
    </div>
  );
}
