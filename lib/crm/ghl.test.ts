import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { upsertGhlLead } from "./ghl.js";

const OLD_ENV = { ...process.env };

// Build a fetch mock that routes by URL: the upsert call vs the notes call.
function makeFetch(opts: { upsertStatus?: number; notesStatus?: number; contactId?: string } = {}) {
  const { upsertStatus = 201, notesStatus = 201, contactId = "c1" } = opts;
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).endsWith("/contacts/upsert")) {
      return new Response(JSON.stringify({ contact: { id: contactId } }), { status: upsertStatus });
    }
    if (String(url).includes("/notes")) {
      return new Response(JSON.stringify({ note: { id: "n1" } }), { status: notesStatus });
    }
    return new Response("{}", { status: 200 });
  });
}

function callBody(fetchMock: ReturnType<typeof makeFetch>, matcher: (u: string) => boolean) {
  const call = fetchMock.mock.calls.find((c) => matcher(String((c as unknown as [string])[0])));
  if (!call) return undefined;
  return JSON.parse((call as unknown as [string, RequestInit])[1].body as string);
}

beforeEach(() => {
  process.env.GHL_PIT_EWR_TOKEN = "tok";
  process.env.GHL_LOCATION_ID = "loc";
});

afterEach(() => {
  process.env = { ...OLD_ENV };
  vi.unstubAllGlobals();
});

describe("upsertGhlLead", () => {
  it("upserts with email/location/tags/source and NO note property (GHL rejects note on upsert)", async () => {
    const fetchMock = makeFetch();
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
    expect(sent.tags).toContain("AIV: 51/100"); // score rides as a tag (always survives)
    expect(String(sent.source)).toContain("ai-visibility-audit");
    expect(sent).not.toHaveProperty("note"); // 422 if present
  });

  it("posts the score + URL as a SEPARATE note to the returned contact id", async () => {
    const fetchMock = makeFetch({ contactId: "abc123" });
    vi.stubGlobal("fetch", fetchMock);

    await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: 51 });

    const notesCall = fetchMock.mock.calls.find((c) => String((c as unknown as [string])[0]).includes("/notes"));
    expect(notesCall).toBeTruthy();
    expect(String((notesCall as unknown as [string])[0])).toContain("/contacts/abc123/notes");
    const body = callBody(fetchMock, (u) => u.includes("/notes"));
    expect(String(body.body)).toContain("51");
    expect(String(body.body)).toContain("https://x.com");
  });

  it("uses an 'unscorable' tag + note when composite is null", async () => {
    const fetchMock = makeFetch();
    vi.stubGlobal("fetch", fetchMock);

    await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: null });
    const upsert = callBody(fetchMock, (u) => u.endsWith("/contacts/upsert"));
    expect(upsert.tags).toContain("AIV: unscorable");
    const note = callBody(fetchMock, (u) => u.includes("/notes"));
    expect(String(note.body).toLowerCase()).toContain("unscorable");
  });

  it("stays ok:true when the NOTE call fails (lead + score-tag already landed)", async () => {
    const fetchMock = makeFetch({ notesStatus: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const r = await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: 51 });
    expect(r.ok).toBe(true);
  });

  it("returns ok:false (does not throw) when the UPSERT errors", async () => {
    const fetchMock = makeFetch({ upsertStatus: 500 });
    vi.stubGlobal("fetch", fetchMock);
    const r = await upsertGhlLead({ email: "a@b.com", url: "https://x.com", composite: null });
    expect(r.ok).toBe(false);
    // No notes call when the upsert failed.
    expect(fetchMock.mock.calls.some((c) => String((c as unknown as [string])[0]).includes("/notes"))).toBe(false);
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
