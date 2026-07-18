import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { upsertGhlLead } from "./ghl.js";

const OLD_ENV = { ...process.env };

beforeEach(() => {
  process.env.GHL_PIT_EWR_TOKEN = "tok";
  process.env.GHL_LOCATION_ID = "loc";
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

describe("upsertGhlLead", () => {
  it("posts an upsert with email, location, tag, source, and the score note", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ contact: { id: "c1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const r = await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: 51 });
    expect(r.ok).toBe(true);

    const [u, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(u)).toContain("/contacts/upsert");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers.Version).toBe("2021-07-28");
    const sent = JSON.parse(init.body as string);
    expect(sent.email).toBe("a@b.com");
    expect(sent.locationId).toBe("loc");
    expect(sent.tags).toContain("AI Visibility Scorecard");
    expect(String(sent.source)).toContain("ai-visibility-audit");
    // Score and audited URL are recorded (in the note field) so sales sees them.
    expect(String(sent.note)).toContain("51");
    expect(String(sent.note)).toContain("https://x.com");
  });

  it("records an unscorable note when composite is null", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: null });
    const sent = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(String(sent.note).toLowerCase()).toContain("unscorable");
  });

  it("returns ok:false (does not throw) when the API errors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const r = await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: null });
    expect(r.ok).toBe(false);
  });

  it("returns ok:false (does not throw) when fetch itself rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const r = await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: 10 });
    expect(r.ok).toBe(false);
  });

  it("throws (programmer error) when env is missing", async () => {
    delete process.env.GHL_PIT_EWR_TOKEN;
    await expect(upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: 10 })).rejects.toThrow(/GHL env/);
  });
});
