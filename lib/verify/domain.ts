// Domain-ownership verification for the public credential (Phase 1b).
//
// A private report only becomes a PUBLIC certificate once the submitter proves they
// control the domain — by DNS TXT record or a /.well-known file carrying a token we
// issued. This kills the "certify a competitor and publish a negative score" risk.
//
// `canRenderPublic` is THE ownership-gate control: the public verify page and the
// badge render ONLY when it returns true. It is pure and heavily tested.

import { randomBytes } from "node:crypto";
import type { CertificateRow } from "../db/types.js";

export const WELL_KNOWN_PATH = "/.well-known/llm-visibility.txt";
export const DNS_PREFIX = "llm-visibility-verification=";

export function makeVerificationToken(rand: string = randomBytes(16).toString("hex")): string {
  return `llmv_${rand}`;
}

/** URL-safe public slug for a verified cert: domain + short random for uniqueness. */
export function makePublicSlug(domain: string, rand: string = randomBytes(4).toString("hex")): string {
  const base = domain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base}-${rand}`;
}

/**
 * THE ownership gate. A public verify page or badge may render ONLY for a certificate
 * that exists, is ownership-verified public, and is not revoked. Any other state
 * (missing, private/unverified, revoked) must NOT render as a live public credential.
 */
export function canRenderPublic(cert: CertificateRow | null | undefined): boolean {
  return !!cert && cert.is_public === true && cert.revoked === false;
}

export type TxtResolver = (host: string) => Promise<string[][]>; // dns.resolveTxt() shape
export type FetchImpl = typeof fetch;

/** True if the domain publishes a TXT record carrying our token. */
export async function checkDnsTxt(domain: string, token: string, resolveTxt?: TxtResolver): Promise<boolean> {
  const resolver = resolveTxt ?? (async (h: string) => (await import("node:dns/promises")).resolveTxt(h));
  let records: string[][];
  try {
    records = await resolver(domain);
  } catch {
    return false;
  }
  return records.map((chunks) => chunks.join("")).some((r) => r.includes(token));
}

/** True if https://domain/.well-known/llm-visibility.txt contains our token. */
export async function checkWellKnown(domain: string, token: string, fetchImpl: FetchImpl = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://${domain}${WELL_KNOWN_PATH}`, { redirect: "follow" });
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes(token);
  } catch {
    return false;
  }
}

export interface VerificationInstructions {
  token: string;
  dns: { host: string; type: "TXT"; value: string };
  wellKnown: { url: string; content: string };
}

export function verificationInstructions(domain: string, token: string): VerificationInstructions {
  return {
    token,
    dns: { host: domain, type: "TXT", value: `${DNS_PREFIX}${token}` },
    wellKnown: { url: `https://${domain}${WELL_KNOWN_PATH}`, content: token },
  };
}
