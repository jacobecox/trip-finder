import { requireAdminPage } from "@/lib/admin-page";
import { getPropertiesWithCounts } from "@/lib/queries";
import PropertiesTable from "./properties-table";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  await requireAdminPage();
  const rows = await getPropertiesWithCounts();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resorts</h1>
        <p className="mt-1 text-sm text-muted">
          Check locations, nearby activities and the airports searched for each resort. Fix anything that looks off.
        </p>
      </div>
      <PropertiesTable rows={rows} />
    </div>
  );
}
