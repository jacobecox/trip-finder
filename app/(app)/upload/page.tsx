import { requireAdminPage } from "@/lib/admin-page";
import Uploader from "./uploader";

export default async function UploadPage() {
  await requireAdminPage();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Upload the latest list</h1>
        <p className="mt-1 text-sm text-muted">
          Drop in the availability PDF from the exchange. It replaces the current list; new resorts are located and
          tagged automatically. Forwarding the email to trips@ does the same thing.
        </p>
      </div>
      <Uploader />
    </div>
  );
}
