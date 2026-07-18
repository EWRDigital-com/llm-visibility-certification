// GoHighLevel (LeadConnector) contact upsert for AI Visibility Scorecard leads.
//
// Best-effort by contract: a network/API failure returns { ok:false } and NEVER
// throws — the scorecard endpoint must still return the visitor's score even if
// the CRM write fails. The ONLY throw is a programmer error (missing env), so a
// misconfigured deploy fails loudly in logs rather than silently dropping leads.
//
// The audited URL + score ride in the contact NOTE (always works, no schema
// dependency). If EWR later confirms custom-field ids for audited_url / aiv_score,
// add `customFields:[{id,value}]` to the payload + a test — not a blocker for v1.
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

export async function upsertGhlLead(input: GhlLead): Promise<{ ok: boolean }> {
  const token = process.env.GHL_PIT_EWR_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) {
    throw new Error("GHL env missing (GHL_PIT_EWR_TOKEN / GHL_LOCATION_ID)");
  }

  const note =
    input.composite === null
      ? `AI Visibility Scorecard: site was unscorable (blocked to automated readers or JS-rendered). Audited ${input.url}.`
      : `AI Visibility Scorecard: ${input.composite}/100. Audited ${input.url}.`;

  const payload = {
    locationId,
    email: input.email,
    tags: [TAG],
    source: SOURCE,
    note,
  };

  try {
    const res = await fetch(`${API}/contacts/upsert`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_API_VERSION,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
