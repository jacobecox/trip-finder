import { signIn } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { SubmitButton } from "@/components/ui";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,rgba(250,204,21,0.12),transparent_60%)] p-6">
      <div className="card w-full max-w-sm space-y-5 p-7 shadow-2xl shadow-black/40">
        <div className="flex items-center gap-3">
          <Logo className="h-10 w-10" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Trip Finder</h1>
            <p className="text-sm text-muted">The best resort weeks, ranked</p>
          </div>
        </div>
        <p className="text-sm text-muted">
          Each month&apos;s resort availability list, sorted by total trip cost (stay + flights or gas) and how much
          there is to do nearby.
        </p>
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
            That Google account isn&apos;t on the list yet. Ask the person who shared this site to add it.
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <SubmitButton className="btn btn-primary w-full py-2.5">Sign in with Google</SubmitButton>
        </form>
      </div>
    </main>
  );
}
