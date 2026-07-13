"use client";

import { useState } from "react";

interface Instructions {
  token: string;
  dns: { host: string; type: string; value: string };
  wellKnown: { url: string; content: string };
}
type Status =
  | { kind: "idle" }
  | { kind: "issuing" }
  | { kind: "checking" }
  | { kind: "done"; url: string }
  | { kind: "error"; msg: string };

export default function PublishPanel({ submissionId }: { submissionId: string }) {
  const [method, setMethod] = useState<"dns_txt" | "well_known">("dns_txt");
  const [instr, setInstr] = useState<Instructions | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function post(payload: Record<string, unknown>) {
    const res = await fetch("/api/verify-domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId, ...payload }),
    });
    return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  }

  async function issue() {
    setStatus({ kind: "issuing" });
    const { ok, data } = await post({ action: "issue", method });
    if (!ok) return setStatus({ kind: "error", msg: String(data.error ?? "Couldn't start verification.") });
    setInstr(data.instructions as Instructions);
    setStatus({ kind: "idle" });
  }

  async function check() {
    if (!instr) return;
    setStatus({ kind: "checking" });
    const { ok, data } = await post({ action: "check", token: instr.token });
    if (ok && data.verified) return setStatus({ kind: "done", url: String(data.url) });
    setStatus({ kind: "error", msg: String(data.hint ?? data.error ?? "Not verified yet.") });
  }

  if (status.kind === "done") {
    return (
      <div className="mt-10 rounded-xl border border-good/40 bg-good/5 p-5">
        <p className="font-medium text-good">Your certificate is public.</p>
        <p className="mt-2 text-sm text-ink-soft">
          Live at{" "}
          <a href={status.url} className="text-brand underline">
            {status.url}
          </a>
          . Embed the badge with the SVG at <code className="text-xs">{status.url.replace("/verify/", "/badge/")}</code>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 rounded-xl border border-line bg-white p-5">
      <h2 className="font-serif text-lg font-semibold">Make this public</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Prove you control this domain to turn the report into a public certificate + embeddable badge. Unverified
        domains never get a public page.
      </p>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setMethod("dns_txt")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${method === "dns_txt" ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-ink-soft"}`}
        >
          DNS TXT record
        </button>
        <button
          onClick={() => setMethod("well_known")}
          className={`rounded-lg border px-3 py-1.5 text-sm ${method === "well_known" ? "border-brand bg-brand-soft text-brand-ink" : "border-line text-ink-soft"}`}
        >
          .well-known file
        </button>
      </div>

      {!instr && (
        <button
          onClick={issue}
          disabled={status.kind === "issuing"}
          className="mt-4 rounded-lg bg-brand px-4 py-2.5 font-medium text-white disabled:opacity-60"
        >
          {status.kind === "issuing" ? "Preparing…" : "Get verification instructions"}
        </button>
      )}

      {instr && (
        <div className="mt-4 space-y-3 text-sm">
          {method === "dns_txt" ? (
            <div className="rounded-lg bg-ink/[0.03] p-3 font-mono text-xs">
              <div>Host: {instr.dns.host}</div>
              <div>Type: {instr.dns.type}</div>
              <div className="break-all">Value: {instr.dns.value}</div>
            </div>
          ) : (
            <div className="rounded-lg bg-ink/[0.03] p-3 font-mono text-xs">
              <div className="break-all">Create: {instr.wellKnown.url}</div>
              <div className="break-all">Containing: {instr.wellKnown.content}</div>
            </div>
          )}
          <button
            onClick={check}
            disabled={status.kind === "checking"}
            className="rounded-lg bg-brand px-4 py-2.5 font-medium text-white disabled:opacity-60"
          >
            {status.kind === "checking" ? "Checking…" : "I've added it — verify"}
          </button>
        </div>
      )}

      {status.kind === "error" && (
        <p role="alert" className="mt-3 text-sm text-bad">
          {status.msg}
        </p>
      )}
    </div>
  );
}
