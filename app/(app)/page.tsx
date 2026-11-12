import Link from "next/link";
import { currentEmail, isAdminEmail } from "@/lib/auth";
import { getEffectiveSettings, scoreSettingsOf } from "@/lib/prefs";
import { getCurrentListings } from "@/lib/queries";
import { fmtDate } from "@/lib/format";
import { fareStatus } from "@/lib/flights/job";
import FarePricer from "./fare-pricer";
import Trips from "./trips";
import Welcome from "./welcome";

export const dynamic = "force-dynamic";

export default async function Home() {
  const email = await currentEmail();
  const admin = isAdminEmail(email);
  const [{ upload, rows }, { settings: s, personalized }, fares] = await Promise.all([
    getCurrentListings(),
    getEffectiveSettings(email),
    fareStatus(),
  ]);
  if (!upload)
    return (
      <div className="card mx-auto max-w-lg space-y-3 p-8 text-center">
        <p className="text-4xl">🧳</p>
        <h1 className="text-lg font-semibold">No trips yet</h1>
        {admin ? (
          <p className="text-sm text-muted">
            <Link className="link" href="/upload">
              Upload this month&apos;s PDF
            </Link>{" "}
            or forward the email to trips@ to get started.
          </p>
        ) : (
          <p className="text-sm text-muted">This month&apos;s list hasn&apos;t been added yet. Check back soon.</p>
        )}
      </div>
    );
  const resorts = new Set(rows.map((r) => r.propertyId)).size;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">This month&apos;s trips</h1>
          <p className="mt-1 text-sm text-muted">
            {rows.length} week-long stays at {resorts} resorts · list updated {fmtDate(upload.uploadedAt.toISOString().slice(0, 10))}
          </p>
        </div>
        {admin ? (
          <FarePricer {...fares} />
        ) : (
          fares.remaining > 0 && (
            <p className="max-w-xs text-right text-xs text-muted">
              Some flight prices are still estimates; real fares get looked up over time.
            </p>
          )
        )}
      </div>
      <Welcome />
      {personalized && (
        <p className="text-xs text-muted">
          Using your own settings ({s.tickets} plane ticket{s.tickets === 1 ? "" : "s"}…).{" "}
          <Link className="link" href="/settings">
            Change
          </Link>
        </p>
      )}
      <Trips
        rows={rows}
        admin={admin}
        origin={{ label: s.originLabel, lat: s.originLat, lng: s.originLng }}
        airports={{ home: s.originAirport, alt: s.altOriginAirport }}
        scoreSettings={scoreSettingsOf(s)}
      />
    </div>
  );
}
