import { describe, it, expect } from "vitest";
import { assertPublicHost, isPrivateOrReservedIp, validateSubmissionUrl, ValidationError } from "./url";

describe("validateSubmissionUrl", () => {
  it("accepts a normal https URL and derives the domain (lowercased, www-stripped)", () => {
    const t = validateSubmissionUrl("https://www.Example.com/Page?q=1");
    expect(t.domain).toBe("example.com");
    expect(t.hostname).toBe("www.example.com");
    expect(t.url).toContain("https://www.example.com/Page");
  });
  it("rejects non-http(s) schemes", () => {
    expect(() => validateSubmissionUrl("ftp://example.com")).toThrow(ValidationError);
    expect(() => validateSubmissionUrl("file:///etc/passwd")).toThrow(ValidationError);
    expect(() => validateSubmissionUrl("javascript:alert(1)")).toThrow(ValidationError);
  });
  it("rejects missing scheme / non-string / empty", () => {
    expect(() => validateSubmissionUrl("example.com")).toThrow(ValidationError);
    expect(() => validateSubmissionUrl("")).toThrow(ValidationError);
    expect(() => validateSubmissionUrl(null)).toThrow(ValidationError);
    expect(() => validateSubmissionUrl(42)).toThrow(ValidationError);
  });
  it("rejects embedded credentials and dot-less hosts", () => {
    expect(() => validateSubmissionUrl("https://user:pass@example.com")).toThrow(ValidationError);
    expect(() => validateSubmissionUrl("http://localhost")).toThrow(ValidationError);
  });
});

describe("isPrivateOrReservedIp", () => {
  it("flags private / loopback / link-local / metadata / CGNAT (v4)", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.9.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
      expect(isPrivateOrReservedIp(ip), ip).toBe(true);
    }
  });
  it("passes public v4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) expect(isPrivateOrReservedIp(ip), ip).toBe(false);
  });
  it("flags v6 loopback / ULA / link-local + IPv4-mapped, passes public v6", () => {
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
  });
});

describe("assertPublicHost (SSRF gate)", () => {
  const publicResolver = async () => ["93.184.216.34"];
  it("passes a host that resolves to a public IP", async () => {
    await expect(assertPublicHost("example.com", publicResolver)).resolves.toBeUndefined();
  });
  it("blocks localhost / *.local / cloud-metadata by name", async () => {
    await expect(assertPublicHost("localhost", publicResolver)).rejects.toThrow(ValidationError);
    await expect(assertPublicHost("printer.local", publicResolver)).rejects.toThrow(ValidationError);
    await expect(assertPublicHost("metadata.google.internal", publicResolver)).rejects.toThrow(ValidationError);
  });
  it("blocks a host that RESOLVES to a private IP (DNS-rebinding style)", async () => {
    await expect(assertPublicHost("evil.example", async () => ["169.254.169.254"])).rejects.toThrow(ValidationError);
  });
  it("blocks a literal private-IP host without needing DNS", async () => {
    await expect(assertPublicHost("127.0.0.1", async () => [])).rejects.toThrow(ValidationError);
  });
});
