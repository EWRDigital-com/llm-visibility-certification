// URL validation + SSRF hardening for user-submitted audit targets.
//
// The audit worker fetches ANY URL a stranger submits, server-side — a classic
// SSRF vector. We (1) accept only http/https public URLs and (2) refuse hosts that
// resolve to private / loopback / link-local / cloud-metadata addresses. The DNS
// resolver is injectable so this is fully unit-testable without real network I/O.
//
// NOTE: this guards the INITIAL target. A public URL that 302-redirects to a private
// one is still a residual redirect-SSRF risk; pinning every redirect hop is a
// hardening follow-up (tracked in the roadmap), not covered here.

export class ValidationError extends Error {
  override name = "ValidationError";
}

export interface ValidatedTarget {
  /** Normalized absolute URL to scrape. */
  url: string;
  /** Registrable-ish host for dedup/cert keying (lowercased, leading www. stripped). */
  domain: string;
  /** The raw hostname to run the SSRF DNS check against. */
  hostname: string;
}

/** Parse + shape-validate a submitted URL. Throws ValidationError on anything unusable.
 *  Does NOT do DNS (that's assertPublicHost, which is async). */
export function validateSubmissionUrl(input: unknown): ValidatedTarget {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ValidationError("Enter a URL to audit.");
  }
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new ValidationError("That doesn't look like a full URL — include https:// (e.g. https://example.com/page).");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ValidationError("Only http:// and https:// URLs can be audited.");
  }
  if (u.username || u.password) {
    throw new ValidationError("Remove the username:password@ part of the URL and try again.");
  }
  const hostname = u.hostname.toLowerCase();
  if (!hostname || !hostname.includes(".") || hostname.endsWith(".")) {
    throw new ValidationError("Enter a public domain, e.g. https://example.com.");
  }
  const domain = hostname.replace(/^www\./, "");
  return { url: u.toString(), domain, hostname };
}

// ---------- SSRF: reject private / reserved destinations ----------

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost"];
const BLOCKED_HOST_EXACT = new Set(["localhost", "metadata.google.internal"]);

export function isPrivateOrReservedIp(ip: string): boolean {
  const addr = ip.trim().toLowerCase();

  // IPv6 (incl. IPv4-mapped ::ffff:a.b.c.d)
  if (addr.includes(":")) {
    if (addr === "::1" || addr === "::") return true;
    if (addr.startsWith("fe80") || addr.startsWith("fc") || addr.startsWith("fd")) return true; // link-local + ULA
    const mapped = addr.match(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (mapped?.[1]) return isPrivateOrReservedIp(mapped[1]);
    return false;
  }

  const parts = addr.split(".");
  if (parts.length !== 4) return false;
  const oct = parts.map((p) => Number(p));
  if (oct.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = oct as [number, number, number, number];
  if (a === 0 || a === 127) return true; // this-network, loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local (incl. 169.254.169.254 metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export type HostResolver = (hostname: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (hostname) => {
  const dns = await import("node:dns/promises");
  const records = await dns.lookup(hostname, { all: true });
  return records.map((r) => r.address);
};

/** Async SSRF gate: refuse hosts that are, or resolve to, private/reserved IPs.
 *  Call after validateSubmissionUrl and before fetching. Throws ValidationError. */
export async function assertPublicHost(hostname: string, resolve: HostResolver = defaultResolver): Promise<void> {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOST_EXACT.has(host) || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new ValidationError("That host isn't publicly reachable.");
  }
  // Literal IP submitted directly.
  if (/^[0-9.]+$/.test(host) || host.includes(":")) {
    if (isPrivateOrReservedIp(host)) throw new ValidationError("That address isn't a public destination.");
    return;
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new ValidationError("We couldn't resolve that domain — check the spelling and try again.");
  }
  if (addresses.length === 0) {
    throw new ValidationError("We couldn't resolve that domain — check the spelling and try again.");
  }
  if (addresses.some(isPrivateOrReservedIp)) {
    throw new ValidationError("That host resolves to a private address and can't be audited.");
  }
}
