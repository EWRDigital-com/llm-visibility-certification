import type { Config } from "tailwindcss";

// Brand tokens for LLM Visibility™ — a considered "verification/credential" palette
// (teal accent, cool-neutral ink), not a default. Kept small; expand as pages land.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#191D23", soft: "#4B535E", faint: "#727C88" },
        brand: { DEFAULT: "#1C7A72", ink: "#0E4C47", soft: "#DFEEEC" },
        line: "#E1E5EA",
        good: "#2C8A56",
        warn: "#9E6B12",
        bad: "#B03A31",
      },
      fontFamily: {
        serif: ['"Iowan Old Style"', '"Palatino Linotype"', "Palatino", "Georgia", "serif"],
        sans: ["system-ui", "-apple-system", '"Segoe UI"', "Roboto", "sans-serif"],
        mono: ["ui-monospace", '"SF Mono"', "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
