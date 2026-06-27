import { describe, it, expect } from "vitest";
import { isPathAllowed } from "./robots";

describe("isPathAllowed", () => {
  it("allows everything when robots.txt is empty", () => {
    expect(isPathAllowed("", "GPTBot", "/anything")).toBe(true);
  });

  it("blocks a bot with its own Disallow: / group", () => {
    const txt = `User-agent: GPTBot\nDisallow: /`;
    expect(isPathAllowed(txt, "GPTBot", "/page")).toBe(false);
  });

  it("matches the user-agent case-insensitively", () => {
    const txt = `User-agent: gptbot\nDisallow: /`;
    expect(isPathAllowed(txt, "GPTBot", "/page")).toBe(false);
  });

  it("falls back to the * group when the bot has no specific group", () => {
    const txt = `User-agent: *\nDisallow: /`;
    expect(isPathAllowed(txt, "ClaudeBot", "/page")).toBe(false);
  });

  it("lets a specific bot group override a restrictive * group", () => {
    // * is blocked, but GPTBot has its own (permissive, empty Disallow) group.
    const txt = `User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nDisallow:`;
    expect(isPathAllowed(txt, "GPTBot", "/page")).toBe(true);
    expect(isPathAllowed(txt, "ClaudeBot", "/page")).toBe(false);
  });

  it("honors an Allow carve-out via longest-match wins", () => {
    const txt = `User-agent: *\nDisallow: /blog\nAllow: /blog/public`;
    expect(isPathAllowed(txt, "GPTBot", "/blog/private")).toBe(false);
    expect(isPathAllowed(txt, "GPTBot", "/blog/public/x")).toBe(true);
  });

  it("does a prefix match on Disallow paths", () => {
    const txt = `User-agent: *\nDisallow: /private`;
    expect(isPathAllowed(txt, "GPTBot", "/private/secret")).toBe(false);
    expect(isPathAllowed(txt, "GPTBot", "/public")).toBe(true);
  });

  it("treats an empty Disallow as allow-all", () => {
    const txt = `User-agent: *\nDisallow:`;
    expect(isPathAllowed(txt, "GPTBot", "/anything")).toBe(true);
  });

  it("ignores comments and blank lines", () => {
    const txt = `# crawler rules\n\nUser-agent: GPTBot  # the OpenAI bot\nDisallow: /  # block all\n`;
    expect(isPathAllowed(txt, "GPTBot", "/x")).toBe(false);
  });

  it("supports $ end-anchor patterns", () => {
    const txt = `User-agent: *\nDisallow: /*.pdf$`;
    expect(isPathAllowed(txt, "GPTBot", "/doc.pdf")).toBe(false);
    expect(isPathAllowed(txt, "GPTBot", "/doc.pdf.html")).toBe(true);
  });

  it("defaults to allow when no group matches and there is no *", () => {
    const txt = `User-agent: Googlebot\nDisallow: /`;
    expect(isPathAllowed(txt, "GPTBot", "/page")).toBe(true);
  });

  it("counts wildcards toward longest-match specificity (Google spec)", () => {
    // /folder (7 chars) vs /*.htm$ (7 chars) — a tie, so Allow wins → allowed.
    const txt = `User-agent: *\nDisallow: /folder\nAllow: /*.htm$`;
    expect(isPathAllowed(txt, "GPTBot", "/folder/page.htm")).toBe(true);
    expect(isPathAllowed(txt, "GPTBot", "/folder/page.txt")).toBe(false);
  });
});
