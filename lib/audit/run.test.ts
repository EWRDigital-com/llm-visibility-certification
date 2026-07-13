import { describe, it, expect } from "vitest";
import { runAudit } from "./run";
import { ScrapeError } from "../scrape/firecrawl";
import type { AuditStore, NewAudit, ScoreRow } from "../db/repo";
import type { PageScrape, Tier } from "../scorer/types";

const NOW = new Date("2026-06-26T00:00:00Z");

function goodScrape(): PageScrape {
  return {
    url: "https://acme.example/",
    finalUrl: "https://acme.example/",
    statusCode: 200,
    lang: "en",
    title: "Acme Robotics — Automation",
    metaDescription: "Acme Robotics builds industrial automation for manufacturing plants with proven results.",
    text: "Acme grew output by 45% and cut costs by $2,000,000. Studies show 30 percent gains.",
    headings: [
      { level: 1, text: "Acme Robotics" },
      { level: 2, text: "What is automation?" },
      { level: 2, text: "How does Acme help?" },
      { level: 3, text: "Case studies" },
    ],
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@graph": [
          { "@type": "Organization", name: "Acme Robotics", sameAs: ["https://linkedin.com/company/acme", "https://x.com/acme"] },
          { "@type": "Article", author: { "@type": "Person", name: "Jane Doe" } },
        ],
      },
    ],
    links: [
      { href: "https://nist.gov/x", rel: null, text: "NIST", external: true },
      { href: "https://acme.example/about", rel: null, text: "About", external: false },
    ],
    blockquotes: 1,
    publishedDate: "2026-05-01",
    modifiedDate: "2026-06-01",
    author: "Jane Doe",
    robots: { fetched: true, raw: "User-agent: *\nAllow: /" },
    botAccess: [
      { bot: "GPTBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "ClaudeBot", allowedByRobots: true, fetchStatus: 200 },
      { bot: "Google-Extended", allowedByRobots: true, fetchStatus: 200 },
    ],
  };
}

interface CertCall {
  submissionId: string;
  auditId: string;
  domain: string;
  score: number;
  tier: Tier;
}

function fakeStore() {
  const calls = {
    audits: [] as NewAudit[],
    scores: [] as { auditId: string; rows: ScoreRow[] }[],
    superseded: [] as string[],
    certs: [] as CertCall[],
  };
  const store: AuditStore = {
    async createAudit(a) {
      calls.audits.push(a);
      return "audit-1";
    },
    async insertScores(auditId, rows) {
      calls.scores.push({ auditId, rows });
    },
    async supersedeActiveCertificates(domain) {
      calls.superseded.push(domain);
    },
    async createCertificate(c) {
      calls.certs.push(c);
      return "cert-1";
    },
  };
  return { store, calls };
}

describe("runAudit", () => {
  it("scores a good scrape and persists audit + scores + a private cert (superseding prior)", async () => {
    const { store, calls } = fakeStore();
    const r = await runAudit({
      submissionId: "s1",
      url: "https://acme.example/",
      domain: "acme.example",
      store,
      scrape: async () => goodScrape(),
      now: NOW,
    });
    expect(r.status).toBe("ok");
    expect(r.certificateId).toBe("cert-1");
    expect(typeof r.composite).toBe("number");
    expect(calls.audits[0]?.status).toBe("ok");
    expect(calls.scores[0]?.rows.length).toBeGreaterThan(0);
    expect(calls.superseded).toEqual(["acme.example"]); // dedup ran before issuing
    expect(calls.certs[0]?.domain).toBe("acme.example");
  });

  it("records a FAILED audit and NO certificate when the page is unreachable", async () => {
    const { store, calls } = fakeStore();
    const r = await runAudit({
      submissionId: "s1",
      url: "https://x.example/",
      domain: "x.example",
      store,
      scrape: async () => {
        throw new ScrapeError("https://x.example is unreachable — it may be offline or blocking automated visitors");
      },
    });
    expect(r.status).toBe("failed");
    expect(r.certificateId).toBeNull();
    expect(r.composite).toBeNull();
    expect(calls.certs.length).toBe(0);
    expect(calls.audits[0]?.composite).toBeNull();
    expect(calls.audits[0]?.error).toBeTruthy();
  });

  it("marks a JS / anti-bot shell as INCOMPLETE (never a fabricated 0-score)", async () => {
    const { store, calls } = fakeStore();
    const r = await runAudit({
      submissionId: "s1",
      url: "https://spa.example/",
      domain: "spa.example",
      store,
      scrape: async () => {
        throw new ScrapeError("https://spa.example returned no scorable content — the page is likely JavaScript-rendered");
      },
    });
    expect(r.status).toBe("incomplete");
    expect(r.certificateId).toBeNull();
    expect(calls.certs.length).toBe(0);
  });
});
