import { signIn } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Trip Finder</h1>
      {error && (
        <p className="rounded bg-red-50 p-3 text-sm text-red-700">
          Sign-in failed. This app is limited to approved accounts.
        </p>
      )}
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="w-full rounded bg-black px-4 py-2 text-white">Sign in with Google</button>
      </form>
    </main>
  );
}
