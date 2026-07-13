// Best-effort in-memory rate limit (per warm serverless instance only). This is a
// placeholder that blunts trivial hammering — it is NOT durable across instances.
// The real IP+domain daily cap + job queue + CAPTCHA (email-abuse mitigation) is
// Phase-1c / T8. Do not rely on this for abuse prevention at launch.

const HITS = new Map<string, number[]>();

export function rateLimited(key: string, limit = 5, windowMs = 60_000, now: number = Date.now()): boolean {
  const recent = (HITS.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    HITS.set(key, recent);
    return true;
  }
  recent.push(now);
  HITS.set(key, recent);
  return false;
}
