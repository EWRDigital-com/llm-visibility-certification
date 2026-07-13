import { describe, it, expect } from "vitest";
import { makeToken, verifyToken } from "./tokens";

const SECRET = "test-secret-abcdef1234567890";

describe("magic-link tokens", () => {
  const now = 1_000_000;

  it("round-trips a valid, unexpired token", () => {
    const t = makeToken({ sid: "abc", exp: now + 100 }, SECRET);
    expect(verifyToken(t, SECRET, now)).toEqual({ sid: "abc", exp: now + 100 });
  });
  it("rejects an expired token", () => {
    const t = makeToken({ sid: "abc", exp: now - 1 }, SECRET);
    expect(verifyToken(t, SECRET, now)).toBeNull();
  });
  it("rejects a token signed with a different secret", () => {
    const t = makeToken({ sid: "abc", exp: now + 100 }, SECRET);
    expect(verifyToken(t, "another-secret-xxxxxxxxxx", now)).toBeNull();
  });
  it("rejects a tampered payload (forged sid keeps the old signature)", () => {
    const t = makeToken({ sid: "abc", exp: now + 100 }, SECRET);
    const sig = t.slice(t.indexOf(".") + 1);
    const forgedBody = Buffer.from(JSON.stringify({ sid: "admin", exp: now + 100 })).toString("base64url");
    expect(verifyToken(`${forgedBody}.${sig}`, SECRET, now)).toBeNull();
  });
  it("rejects malformed tokens", () => {
    expect(verifyToken("garbage", SECRET, now)).toBeNull();
    expect(verifyToken("", SECRET, now)).toBeNull();
    expect(verifyToken("no-dot-here", SECRET, now)).toBeNull();
    expect(verifyToken(".onlysig", SECRET, now)).toBeNull();
  });
});
