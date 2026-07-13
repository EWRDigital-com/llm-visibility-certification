import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Visibility™ Score — Free AI Readiness Audit",
  description:
    "A free, deterministic on-page audit that scores how ready a page is to be cited by AI answer engines — the weakest pillar to fix first, and where it sits on the maturity ladder.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-ink antialiased">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-4xl items-center justify-between px-5 py-4">
            <a href="/" className="font-serif text-lg font-semibold tracking-tight text-ink">
              LLM Visibility<sup className="text-[0.6em]">™</sup> Score
            </a>
            <span className="font-mono text-xs uppercase tracking-widest text-brand">
              on-page readiness audit
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-5 py-10">{children}</main>

        <footer className="mt-16 border-t border-line">
          <div className="mx-auto max-w-4xl px-5 py-8 text-xs leading-relaxed text-ink-faint">
            {/* TODO(Matt): replace with the approved trademark legal line + issuing entity
                (independent, under Matt Bertram — pending sign-off). */}
            <p>
              LLM Visibility<sup>™</sup> is a trademark of Matt Bertram. This certification is issued
              independently under the LLM Visibility™ mark. Methodology from the book{" "}
              <em>LLM Visibility</em> by Matt Bertram.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
