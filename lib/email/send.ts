// Transactional email adapter (magic link). Env-gated: with no RESEND_API_KEY set,
// it logs the link to the server console instead of sending — so the whole flow is
// runnable in local dev before an email provider + authenticated sending domain
// (SPF/DKIM/DMARC) are configured. Uses Resend's REST API directly (no SDK dep).

export interface DeliveryResult {
  delivered: boolean;
  mode: "resend" | "logged";
  id?: string;
  error?: string;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendMagicLink(to: string, magicUrl: string): Promise<DeliveryResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "LLM Visibility <noreply@llmvisibilitycertification.com>";

  if (!apiKey) {
    // Dev fallback: no provider configured yet. Never throws — the audit already ran.
    console.info(`[email:logged] magic link for ${to} -> ${magicUrl}`);
    return { delivered: false, mode: "logged" };
  }

  const subject = "Your LLM Visibility™ readiness report is ready";
  const text = [
    "Your LLM Visibility™ on-page readiness audit is ready.",
    "",
    "Open your private report (this link expires in 24 hours):",
    magicUrl,
    "",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { delivered: false, mode: "resend", error: `Resend HTTP ${res.status}: ${body.slice(0, 200)}` };
    }
    const json = (await res.json().catch(() => ({}))) as { id?: string };
    return { delivered: true, mode: "resend", id: json.id };
  } catch (e) {
    return { delivered: false, mode: "resend", error: (e as Error).message };
  }
}
