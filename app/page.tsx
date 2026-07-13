"use client";

import { useState } from "react";

type State = { kind: "idle" } | { kind: "submitting" } | { kind: "sent"; email: string } | { kind: "error"; message: string };

export default function Home() {
  const [url, setUrl] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState({ kind: "submitting" });
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, email, consent }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setState({ kind: "error", message: data.error ?? "Something went wrong. Please try again." });
        return;
      }
      setState({ kind: "sent", email });
    } catch {
      setState({ kind: "error", message: "Network error — please try again." });
    }
  }

  if (state.kind === "sent") {
    return (
      <section className="mx-auto max-w-xl text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-4 text-ink-soft">
          We ran the audit and sent a private link to <strong className="text-ink">{state.email}</strong>. Open it to
          see your on-page readiness report. The link expires in 24 hours.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl">
      <h1 className="text-balance font-serif text-4xl font-semibold leading-[1.1] tracking-tight">
        How ready is your page to be cited by AI?
      </h1>
      <p className="mt-4 text-ink-soft">
        Enter a URL and we&rsquo;ll run a free, deterministic on-page audit — your readiness score, the weakest pillar
        to fix first, and where the page sits on the maturity ladder. This measures <strong className="text-ink">
        on-page readiness</strong>, not a prediction that you will be cited.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="url" className="block font-mono text-xs uppercase tracking-widest text-ink-faint">
            Page URL
          </label>
          <input
            id="url"
            type="url"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/page"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div>
          <label htmlFor="email" className="block font-mono text-xs uppercase tracking-widest text-ink-faint">
            Email (for your private report)
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mt-1 w-full rounded-lg border border-line px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <label className="flex items-start gap-2 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-1"
          />
          <span>I agree to receive my report by email and to the processing of this URL for the audit.</span>
        </label>

        {state.kind === "error" && (
          <p role="alert" className="rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
            {state.message}
          </p>
        )}

        <button
          type="submit"
          disabled={state.kind === "submitting"}
          className="w-full rounded-lg bg-brand px-4 py-3 font-medium text-white transition hover:bg-brand-ink disabled:opacity-60"
        >
          {state.kind === "submitting" ? "Running audit…" : "Run my free audit"}
        </button>
      </form>
    </section>
  );
}
