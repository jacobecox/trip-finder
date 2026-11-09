import Uploader from "./uploader";

export default function UploadPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Upload listings PDF</h1>
      <Uploader />
    </div>
  );
}
