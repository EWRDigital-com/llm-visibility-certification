// Minimal robots.txt evaluator — pure, offline-testable.
//
// We only need one question answered: is a given AI crawler (by product token,
// e.g. "GPTBot") allowed to fetch a given path? This implements the parts of the
// robots.txt spec that matter for that: user-agent group selection (specific
// token beats "*"), Allow/Disallow with longest-match-wins (Allow breaks ties),
// prefix matching, and the `*` / `$` path wildcards. Default is allow.

interface RobotsRule {
  allow: boolean;
  pattern: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
}

function parseGroups(robotsTxt: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;

  for (const rawLine of robotsTxt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      // Consecutive user-agent lines accumulate into the same group header.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === "allow" || field === "disallow") {
      if (!current) continue; // directive before any user-agent — ignore
      // Empty Disallow means "allow all" — record nothing for it.
      if (value !== "") current.rules.push({ allow: field === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false; // sitemap/crawl-delay/etc. don't break grouping semantics here
    }
  }
  return groups;
}

/** Select the rules that apply to `botToken`: a specific group wins over `*`. */
function applicableRules(groups: RobotsGroup[], botToken: string): RobotsRule[] {
  const token = botToken.toLowerCase();
  const specific = groups.filter((g) => g.agents.includes(token));
  if (specific.length > 0) return specific.flatMap((g) => g.rules);
  const wildcard = groups.filter((g) => g.agents.includes("*"));
  return wildcard.flatMap((g) => g.rules);
}

/** Convert a robots path pattern (with `*` and `$`) to an anchored regex. */
function patternToRegex(pattern: string): RegExp {
  let re = "^";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "*") re += ".*";
    else if (ch === "$" && i === pattern.length - 1) re += "$";
    else re += ch.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(re);
}

/** Specificity = full pattern length (Google's longest-match rule counts `*` and `$`). */
function specificity(pattern: string): number {
  return pattern.length;
}

export function isPathAllowed(robotsTxt: string, botToken: string, path: string): boolean {
  const rules = applicableRules(parseGroups(robotsTxt), botToken);
  let best: { allow: boolean; score: number } | null = null;

  for (const rule of rules) {
    if (!patternToRegex(rule.pattern).test(path)) continue;
    const score = specificity(rule.pattern);
    // Longest match wins; on a tie, Allow beats Disallow.
    if (!best || score > best.score || (score === best.score && rule.allow && !best.allow)) {
      best = { allow: rule.allow, score };
    }
  }

  return best ? best.allow : true; // default: allow
}
