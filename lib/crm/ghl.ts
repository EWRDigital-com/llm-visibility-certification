// GoHighLevel (LeadConnector) contact upsert for AI Visibility Scorecard leads.
//
// Best-effort by contract: a network/API failure returns { ok:false } and NEVER
// throws — the scorecard endpoint must still return the visitor's score even if
// the CRM write fails. The ONLY throw is a programmer error (missing env), so a
// misconfigured deploy fails loudly in logs rather than silently dropping leads.
//
// TWO calls, because GHL v2 splits them (verified live 2026-07-18):
//   1. POST /contacts/upsert  — contact + tags + source. The upsert endpoint
//      REJECTS a `note` property (422 "property note should not exist"), so the
//      score can't ride here. A score TAG (e.g. "AIV: 93/100") does ride, so the
//      number is always visible/filterable in the CRM even if step 2 fails.
//   2. POST /contacts/{id}/notes — the full score note (audited URL + score).
//      Best-effort; a failure here still leaves ok:true (the lead + score-tag landed).
//
// Env (set in the endpoint's Vercel project; sourced from seo-intel/.env):
//   GHL_PIT_EWR_TOKEN  ← the Private Integration Token (same value as seo-intel)
//   GHL_LOCATION_ID    ← the sub-account/location id
//                        (seo-intel stores this as GHL_COMPANY_Location_ID — map
//                         it to this clean name when adding the Vercel env var).

export interface GhlLead {
  email: string;
  url: string;
  composite: number | null;
}

const API = "https://services.leadconnectorhq.com";
const TAG = "AI Visibility Scorecard";
const SOURCE = "AI Visibility Scorecard (ewrdigital.com/ai-visibility-audit)";
const GHL_API_VERSION = "2021-07-28";

function ghlHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Version: GHL_API_VERSION,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

export async function upsertGhlLead(input: GhlLead): Promise<{ ok: boolean }> {
  const token = process.env.GHL_PIT_EWR_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error("GHL env missing (GHL_PIT_EWR_TOKEN / GHL_LOCATION_ID)");
  }

  // A score tag so the number is visible/filterable in the CRM even if the note
  // POST later fails. Kept short + human-readable.
  const scoreTag = input.composite === null ? "AIV: unscorable" : `AIV: ${input.composite}/100`;

  const note =
    input.composite === null
      ? `AI Visibility Scorecard: site was unscorable (blocked to automated readers or JS-rendered). Audited ${input.url}.`
      : `AI Visibility Scorecard: ${input.composite}/100. Audited ${input.url}.`;

  const upsertPayload = {
    locationId,
    email: input.email,
    tags: [TAG, scoreTag],
    source: SOURCE,
  };

  let contactId: string | undefined;
  try {
    const res = await fetch(`${API}/contacts/upsert`, {
      method: "POST",
      headers: ghlHeaders(token),
      body: JSON.stringify(upsertPayload),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json().catch(() => ({}))) as { contact?: { id?: string } };
    contactId = data.contact?.id;
  } catch {
    return { ok: false };
  }

  // Best-effort note with the full detail. A failure here does NOT flip ok — the
  // lead and the score tag already landed, which is the value that matters.
  if (contactId) {
    try {
      await fetch(`${API}/contacts/${contactId}/notes`, {
        method: "POST",
        headers: ghlHeaders(token),
        body: JSON.stringify({ body: note }),
      });
    } catch {
      /* swallow — the note is a nice-to-have on top of the tag */
    }
  }

  return { ok: true };
}
