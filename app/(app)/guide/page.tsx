import Link from "next/link";
import { currentEmail, isAdminEmail } from "@/lib/auth";
import { getEffectiveSettings } from "@/lib/prefs";
import { rampColor } from "@/lib/map";
import { TAGS, tagDisplay } from "@/lib/tags/constants";

export const dynamic = "force-dynamic";

export default async function GuidePage() {
  const email = await currentEmail();
  const admin = isAdminEmail(email);
  const { settings: s } = await getEffectiveSettings(email);
  const w = Math.max(0, s.costWeight) + Math.max(0, s.activityWeight) || 1;
  const costPct = Math.round((100 * Math.max(0, s.costWeight)) / w);
  const liked = TAGS.filter((t) => (s.tagWeights[t] ?? 0) > 0).sort((a, b) => s.tagWeights[b] - s.tagWeights[a]);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">How Trip Finder works</h1>
        <p className="mt-1 text-muted">
          Every month the resort exchange sends a list of week-long stays that are open. This site ranks them so the
          good ones are easy to spot.
        </p>
      </header>

      <Section icon="🃏" title="Reading a trip card">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Score badge</b> (top left): 0–100, higher is better. See below for how it&apos;s worked out.
          </li>
          <li>
            <b>Whole trip price</b> (yellow, top right) = <b>Stay</b> + <b>Flights</b> (or <b>Gas</b> when we&apos;d
            drive). Flights are round trip for {s.tickets} seats{s.lapInfants > 0 ? `, with ${s.lapInfants} lap infant` : ""}.
          </li>
          <li>
            <b>Dates</b>: check-in to check-out, how many nights, and how soon it starts.
          </li>
          <li>
            <b>Travel</b>: 🚗 drive time for places within {s.maxDriveHours} hours of {s.originLabel}, otherwise ✈ the
            cheapest flight we found. Click <span className="text-accent">Google Flights ↗</span> to see that search
            yourself.
          </li>
          <li>
            <b>Weather</b> (next to the dates): the usual sky and daytime high for those dates, from the last 10
            years of weather there. Not a forecast. ☀️ sunny · ⛅ partly cloudy · ☁️ cloudy · 🌧 rainy (rain on
            about half the days) · ❄️ snowy.
          </li>
          <li>
            <b>Activity chips</b>: what&apos;s nearby (beach, theme parks, zoo…).
          </li>
          <li>
            <b>Tap a card</b> for that trip&apos;s own page: flight details, what&apos;s nearby by name, other weeks at
            the same resort, and a <b>Share</b> button to text the link to family.
          </li>
        </ul>
      </Section>

      <Section icon="⭐" title="How the score works">
        <p>
          The score mixes two things: <b>{costPct}% cost</b> and <b>{100 - costPct}% activities</b>.
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Cost</b>: the cheapest trip on the list gets 100, the most expensive gets 0, and everything else falls in
            between.
          </li>
          <li>
            <b>Activities</b>: points for each kind of thing nearby (beaches, theme parks, hiking, skiing, city
            sights…), weighted by how much each one matters to you
            {liked.length > 0 && <>, most to least: {liked.map(tagDisplay).join(", ")}</>}. Change the weights in{" "}
            <Link className="link" href="/settings">
              Settings
            </Link>
            .
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span>Colors rank what you&apos;re looking at:</span>
          <span
            className="inline-block h-3 w-28 rounded-full"
            style={{ background: `linear-gradient(to right, ${rampColor(0)}, ${rampColor(0.5)}, ${rampColor(1)})` }}
          />
          <span className="text-muted">red = lower, green = best of the trips shown</span>
        </div>
        <p className="text-muted">
          Filtering changes the colors: the greenest card is always the best of what&apos;s left on screen.
        </p>
      </Section>

      <Section icon="🔎" title="Finding trips">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>When</b>: pick a start and end day, or click the month name for the whole month. Days with stays are
            shaded green.
          </li>
          <li>
            <b>Activity chips</b>: tap one (like 🏖️ Beach) to only see places with it. Tap it again to clear.
          </li>
          <li>
            <b>🚗 Drivable only</b>: skip flying entirely.
          </li>
          <li>
            <b>✨ New</b> and <b>↓ Price drops</b>: what changed since the previous list. Cards show a{" "}
            <span className="text-sky-300">New</span> tag or how much cheaper the stay got.
          </li>
          {s.altOriginAirport && (
            <li>
              <b>Fly from</b>: {s.altOriginAirport} is often cheaper, {s.originAirport} is closer. The {s.altOriginAirport}{" "}
              price already includes driving there and parking, so the comparison is fair.
            </li>
          )}
          <li>
            <b>More filters</b>: number of plane tickets, unit size, country and state.
          </li>
          <li>
            <b>Settings</b>: save your own number of plane tickets, what matters most (cost vs. activities, which
            activities), and gas and flight estimates. They only change what <i>you</i> see.
          </li>
          <li>
            <b>Sort by</b>: best score, cheapest, soonest, closest, and more.
          </li>
        </ul>
      </Section>

      <Section icon="🗺" title="Cards, map and table">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <b>Cards</b>: the easiest to read, and best on a phone.
          </li>
          <li>
            <b>Map</b>: one pin per resort, colored by its best trip; bigger pins have more dates. Click a pin for its
            dates and prices.
          </li>
          <li>
            <b>Table</b>: everything in columns on a big screen. Click a column heading to sort by it.
          </li>
        </ul>
      </Section>

      <Section icon="💡" title="Good to know">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            Prices marked <span className="text-amber-200">estimate</span> haven&apos;t had real fares looked up yet; they
            use a rough guess from the distance.
          </li>
          <li>Flight prices change daily, so check Google Flights before booking.</li>
          <li>
            Booking happens through the exchange, not here. This site only helps pick which week to ask for.
          </li>
          <li>A new list arrives about once a month, and the page updates on its own.</li>
        </ul>
      </Section>

      {admin && (
        <Section icon="🛠" title="Admin (only you see this)">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Forward the monthly email to trips@ (or use{" "}
              <Link className="link" href="/upload">
                Upload
              </Link>
              ). New resorts get located and tagged automatically, and you get a top-10 email.
            </li>
            <li>
              Fix a resort&apos;s location, activities or airports on{" "}
              <Link className="link" href="/properties">
                Properties
              </Link>
              ; change weights, home and costs in{" "}
              <Link className="link" href="/settings">
                Settings
              </Link>
              .
            </li>
            <li>Family members can browse but can&apos;t upload, edit, or spend flight searches.</li>
          </ul>
        </Section>
      )}

      <p className="text-center">
        <Link href="/" className="btn btn-primary">
          Browse trips →
        </Link>
      </p>
    </article>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card space-y-2 p-5 text-sm leading-relaxed">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <span aria-hidden>{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
