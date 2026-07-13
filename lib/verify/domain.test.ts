import { describe, it, expect } from "vitest";
import {
  canRenderPublic,
  checkDnsTxt,
  checkWellKnown,
  DNS_PREFIX,
  makePublicSlug,
  makeVerificationToken,
} from "./domain";
import type { CertificateRow } from "../db/types";

function cert(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "c1",
    submission_id: "s1",
    audit_id: "a1",
    public_slug: "example-com-abcd",
    domain: "example.com",
    score: 82,
    tier: "gold",
    is_public: true,
    ownership_verified_at: "2026-07-13T00:00:00Z",
    badge_path: null,
    revoked: false,
    superseded: false,
    audited_at: "2026-07-13T00:00:00Z",
    issued_at: "2026-07-13T00:00:00Z",
    ...overrides,
  };
}

describe("canRenderPublic — THE ownership gate", () => {
  it("renders only an existing, public, non-revoked cert", () => {
    expect(canRenderPublic(cert())).toBe(true);
  });
  it("never renders a missing cert", () => {
    expect(canRenderPublic(null)).toBe(false);
    expect(canRenderPublic(undefined)).toBe(false);
  });
  it("NEVER renders an unverified/private cert (the certify-a-competitor guard)", () => {
    expect(canRenderPublic(cert({ is_public: false }))).toBe(false);
  });
  it("never renders a revoked cert", () => {
    expect(canRenderPublic(cert({ revoked: true }))).toBe(false);
    expect(canRenderPublic(cert({ is_public: true, revoked: true }))).toBe(false);
  });
});

describe("verification token + public slug", () => {
  it("mints a prefixed token", () => {
    expect(makeVerificationToken("deadbeef")).toBe("llmv_deadbeef");
  });
  it("slugs a domain safely (lowercase, non-alnum -> dashes) + random suffix", () => {
    expect(makePublicSlug("Example.COM", "abcd")).toBe("example-com-abcd");
    expect(makePublicSlug("sub.example.co.uk", "12ab")).toBe("sub-example-co-uk-12ab");
  });
});

describe("checkDnsTxt", () => {
  it("passes when a TXT record carries the token", async () => {
    const resolver = async () => [["v=spf1 -all"], [`${DNS_PREFIX}llmv_tok`]];
    expect(await checkDnsTxt("example.com", "llmv_tok", resolver)).toBe(true);
  });
  it("joins split TXT chunks before matching", async () => {
    const resolver = async () => [[`${DNS_PREFIX}llmv_`, "tok"]];
    expect(await checkDnsTxt("example.com", "llmv_tok", resolver)).toBe(true);
  });
  it("fails when nothing matches or the lookup throws", async () => {
    expect(await checkDnsTxt("example.com", "llmv_tok", async () => [["nope"]])).toBe(false);
    expect(
      await checkDnsTxt("example.com", "llmv_tok", async () => {
        throw new Error("NXDOMAIN");
      }),
    ).toBe(false);
  });
});

describe("checkWellKnown", () => {
  const fakeFetch = (body: string, ok = true) =>
    (async () => ({ ok, text: async () => body })) as unknown as typeof fetch;

  it("passes when the file contains the token", async () => {
    expect(await checkWellKnown("example.com", "llmv_tok", fakeFetch("llmv_tok\n"))).toBe(true);
  });
  it("fails on non-ok status, missing token, or network error", async () => {
    expect(await checkWellKnown("example.com", "llmv_tok", fakeFetch("nope"))).toBe(false);
    expect(await checkWellKnown("example.com", "llmv_tok", fakeFetch("llmv_tok", false))).toBe(false);
    const throwFetch = (async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;
    expect(await checkWellKnown("example.com", "llmv_tok", throwFetch)).toBe(false);
  });
});
