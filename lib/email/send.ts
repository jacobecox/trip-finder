/**
 * Sends an email through the Cloudflare Email Worker (email-worker/), which can only deliver to
 * the address(es) verified in Cloudflare Email Routing; the worker picks the recipient.
 */
export async function sendEmail(msg: { subject: string; html: string; text: string }) {
  const url = process.env.EMAIL_WORKER_URL;
  const secret = process.env.EMAIL_SECRET;
  if (!url || !secret) throw new Error("EMAIL_WORKER_URL / EMAIL_SECRET not configured");
  const res = await fetch(new URL("/send", url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      // Cloudflare's bot check (error 1010) rejects some default client User-Agents
      "User-Agent": "trip-finder/0.1 (personal project)",
    },
    body: JSON.stringify(msg),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`email worker ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
