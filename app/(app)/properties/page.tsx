import { getPropertiesWithCounts } from "@/lib/queries";
import PropertiesTable from "./properties-table";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const rows = await getPropertiesWithCounts();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Properties</h1>
      <PropertiesTable rows={rows} />
    </div>
  );
}
