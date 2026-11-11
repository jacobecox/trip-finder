import PostalMime from "postal-mime";
import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext";
import { decide, parseList, safeEqual } from "./logic";

interface Env {
  EMAIL: SendEmail;
  APP_URL: string; // https://trips.jacobcox.dev
  FROM_ADDRESS: string; // trips@jacobcox.dev (a domain on Email Routing)
  // secrets (wrangler secret put):
  EMAIL_SECRET: string; // shared with the app (EMAIL_SECRET on Vercel)
  FORWARD_TO: string; // your verified Email Routing destination (Gmail)
  ALLOWED_SENDERS: string; // comma-separated; mail from anyone else is rejected
}

async function send(env: Env, subject: string, text: string, html?: string) {
  const msg = createMimeMessage();
  msg.setSender({ name: "Trip Finder", addr: env.FROM_ADDRESS });
  msg.setRecipient(env.FORWARD_TO);
  msg.setSubject(subject);
  msg.addMessage({ contentType: "text/plain", data: text });
  if (html) msg.addMessage({ contentType: "text/html", data: html });
  await env.EMAIL.send(new EmailMessage(env.FROM_ADDRESS, env.FORWARD_TO, msg.asRaw()));
}

export default {
  /** Mail to trips@: import the PDF, forward Gmail's confirmation email, reject everything else. */
  async email(message: ForwardableEmailMessage, env: Env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw);
    const attachments = parsed.attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: typeof a.content === "string" ? a.content.length : a.content.byteLength,
    }));
    const d = decide({ envelopeFrom: message.from, headerFrom: parsed.from?.address, attachments }, parseList(env.ALLOWED_SENDERS));
    const subject = parsed.subject ?? "(no subject)";

    if (d.action === "forward") {
      await message.forward(env.FORWARD_TO);
      return;
    }
    if (d.action === "reject") return message.setReject(d.reason);
    if (d.action === "notify") {
      await send(env, `Trip Finder: nothing imported from "${subject}"`, `${d.reason}. Upload the PDF by hand at ${env.APP_URL}/upload if needed.`);
      return;
    }

    const pdf = parsed.attachments[d.index];
    const filename = pdf.filename || "availability.pdf";
    const res = await fetch(`${env.APP_URL}/api/ingest/email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EMAIL_SECRET}`,
        "Content-Type": "application/pdf",
        "X-Filename": encodeURIComponent(filename),
      },
      body: pdf.content,
    });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 500);
      await send(
        env,
        `Trip Finder: couldn't import "${filename}"`,
        `The app answered ${res.status}: ${body}\n\nYou can upload it by hand at ${env.APP_URL}/upload.`,
      );
    }
    // success: the app emails the top picks once processing finishes
  },

  /** POST /send {subject, html, text} from the app (Bearer EMAIL_SECRET); always goes to FORWARD_TO. */
  async fetch(req: Request, env: Env) {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/send") return new Response("Not found", { status: 404 });
    const auth = req.headers.get("authorization") ?? "";
    if (!safeEqual(auth.replace(/^Bearer /, ""), env.EMAIL_SECRET)) return new Response("Unauthorized", { status: 401 });
    const body = (await req.json().catch(() => null)) as { subject?: string; html?: string; text?: string } | null;
    if (!body?.subject || !body.text) return new Response("subject and text required", { status: 400 });
    await send(env, body.subject.slice(0, 200), body.text, body.html);
    return Response.json({ ok: true });
  },
} satisfies ExportedHandler<Env>;
