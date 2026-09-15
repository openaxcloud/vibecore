/**
 * Minimal robots.txt evaluation for the web-reference crawl (BUG-AGENT-WEBCLONE-001).
 *
 * Only the pages DISCOVERED by the crawl are subject to it — the URL the user
 * typed is fetched as a browser would. Semantics follow the REP as Google
 * documents it: the most specific group for our token wins over `*`; within a
 * group the longest matching Allow/Disallow path wins, Allow on a tie; `*` is a
 * wildcard and a trailing `$` anchors the end. Anything unparseable allows.
 */

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

export const ROBOTS_USER_AGENT_TOKEN = 'e-codebot';

function normaliseToken(value: string): string {
  return value.trim().toLowerCase();
}

/** Parse the file into the rule group that applies to `token` (falls back to `*`). */
export function parseRobotsTxt(content: string, token: string = ROBOTS_USER_AGENT_TOKEN): RobotsRules {
  const groups = new Map<string, RobotsRules>();

  let current: RobotsRules[] = [];
  let lastWasAgent = false;

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.replace(/#.*$/u, '').trim();

    if (!line) {
      continue;
    }

    const separator = line.indexOf(':');

    if (separator === -1) {
      continue;
    }

    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === 'user-agent') {
      const agent = normaliseToken(value);

      if (!lastWasAgent) {
        current = [];
      }

      const rules = groups.get(agent) ?? { allow: [], disallow: [] };
      groups.set(agent, rules);
      current.push(rules);
      lastWasAgent = true;

      continue;
    }

    lastWasAgent = false;

    if (field !== 'allow' && field !== 'disallow') {
      continue;
    }

    for (const rules of current) {
      rules[field].push(value);
    }
  }

  const wanted = normaliseToken(token);

  for (const [agent, rules] of groups) {
    if (agent !== '*' && (wanted.includes(agent) || agent.includes(wanted))) {
      return rules;
    }
  }

  return groups.get('*') ?? { allow: [], disallow: [] };
}

function ruleMatches(rule: string, path: string): boolean {
  if (rule === '') {
    return false;
  }

  const anchored = rule.endsWith('$');
  const pattern = anchored ? rule.slice(0, -1) : rule;
  const parts = pattern.split('*');

  let position = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (index === 0) {
      if (!path.startsWith(part)) {
        return false;
      }

      position = part.length;
      continue;
    }

    const found = path.indexOf(part, position);

    if (found === -1) {
      return false;
    }

    position = found + part.length;
  }

  return anchored ? position === path.length : true;
}

/** Is `url` crawlable under `rules`? Longest matching rule wins, Allow on a tie. */
export function isAllowedByRobots(rules: RobotsRules, url: string): boolean {
  let path: string;

  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    return false;
  }

  const longest = (candidates: string[]) =>
    candidates.filter((rule) => ruleMatches(rule, path)).reduce((max, rule) => Math.max(max, rule.length), -1);

  const allow = longest(rules.allow);
  const disallow = longest(rules.disallow);

  if (disallow === -1) {
    return true;
  }

  return allow >= disallow;
}
