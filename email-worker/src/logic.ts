/** Pure decision logic for incoming mail (tested from the main repo's vitest). */

export interface Incoming {
  envelopeFrom: string; // SMTP MAIL FROM (Gmail auto-forwarding sets this to your Gmail address)
  headerFrom?: string; // From: header (the exchange, for auto-forwarded mail)
  attachments: { filename?: string | null; mimeType?: string; size: number }[];
}

export type Decision =
  | { action: "ingest"; index: number } // index of the PDF attachment to import
  | { action: "notify"; reason: string } // allowed sender, but nothing to import
  | { action: "forward" } // Gmail's forwarding-confirmation email: pass it on so you can confirm
  | { action: "reject"; reason: string };

// Gmail sends the "confirm forwarding to trips@" code from this address
const GMAIL_FORWARDING_CONFIRM = "forwarding-noreply@google.com";

export const parseList = (s: string | undefined) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/**
 * Canonical mailbox for allowlist checks. Gmail auto-forwarding sends as
 * you+caf_=trips=jacobcox.dev@gmail.com, so drop the +tag; Gmail also ignores dots in the name.
 */
export function mailbox(addr: string) {
  const a = addr.trim().toLowerCase();
  const at = a.lastIndexOf("@");
  if (at < 0) return a;
  let local = a.slice(0, at).split("+")[0];
  let domain = a.slice(at + 1);
  if (GMAIL.has(domain)) {
    local = local.replaceAll(".", "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

const isPdf = (a: Incoming["attachments"][number]) =>
  a.mimeType?.toLowerCase() === "application/pdf" || !!a.filename?.toLowerCase().endsWith(".pdf");

export function decide(m: Incoming, allowedSenders: string[]): Decision {
  const from = [m.envelopeFrom, m.headerFrom].filter(Boolean).map((x) => x!.toLowerCase());
  if (from.includes(GMAIL_FORWARDING_CONFIRM)) return { action: "forward" };
  const allowed = new Set(allowedSenders.map(mailbox));
  if (!from.some((f) => allowed.has(mailbox(f)))) return { action: "reject", reason: "Sender not allowed" };

  // the largest PDF, in case the email also has a small PDF flyer
  let index = -1;
  m.attachments.forEach((a, i) => {
    if (isPdf(a) && (index < 0 || a.size > m.attachments[index].size)) index = i;
  });
  return index < 0 ? { action: "notify", reason: "No PDF attachment found" } : { action: "ingest", index };
}

/** Constant-time compare for the shared secret. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length || !b) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Who gets the top-picks email: you first, then FAMILY_TO, without repeats (case-insensitive).
 * Each one must be a verified destination in Cloudflare Email Routing or Cloudflare refuses it.
 */
export const digestRecipients = (forwardTo: string, family: string | undefined) => [
  ...new Set([forwardTo.trim().toLowerCase(), ...parseList(family)].filter(Boolean)),
];
