/**
 * Server-side fetch of an installable skill's instructions from PUBLIC GitHub
 * raw content (F#27).
 *
 * SSRF boundary: we never fetch a user-supplied URL. The only outbound target is
 * `https://raw.githubusercontent.com/<owner>/<repo>/HEAD/<file>` where owner/repo
 * is already validated to the `owner/repo` charset (no extra path segments, no
 * host injection). As defense-in-depth every constructed URL is re-checked by
 * `isAllowedGithubRawUrl` (strict exact-host allowlist, https-only) before the
 * request is made — a stricter guard than the MCP blocklist because it permits
 * exactly one host.
 */

import { normalizeOwnerRepo } from './skills-repo-catalog.js';

/** Candidate instruction files, tried in priority order. */
export const SKILL_INSTRUCTION_FILES = ['SKILL.md', 'AGENTS.md', 'README.md'] as const;

const GITHUB_RAW_HOST = 'raw.githubusercontent.com';

/** Cap the persisted instructions so a huge README can't bloat the system prompt. */
export const MAX_INSTRUCTIONS_CHARS = 50_000;

const FETCH_TIMEOUT_MS = 6_000;

export type SkillFetchResult =
  | { ok: true; instructions: string; source: string }
  /** Every candidate file 404'd — repo is private, missing, or has no instructions. */
  | { ok: false; reason: 'private_or_missing' }
  /** Network error, timeout, or a non-404 error status. */
  | { ok: false; reason: 'unreachable' };

/**
 * Strict allowlist: only https to raw.githubusercontent.com. Exported for tests
 * and as the SSRF trust boundary for the outbound fetch.
 */
export function isAllowedGithubRawUrl(rawUrl: string): boolean {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== 'https:') {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/\.+$/, '');

  return host === GITHUB_RAW_HOST;
}

/** Build the raw URL for one instruction file of a validated `owner/repo`. */
export function buildRawUrl(ownerRepo: string, file: string): string {
  return `https://${GITHUB_RAW_HOST}/${ownerRepo}/HEAD/${file}`;
}

/**
 * Fetch the first available instruction file for a public GitHub `owner/repo`.
 *
 * `fetchImpl` is injectable so tests can supply a stub; production uses global
 * `fetch`. Returns a discriminated result — never throws.
 */
export async function fetchSkillRepoInstructions(
  ownerRepo: string,
  options: { fetchImpl?: typeof fetch } = {},
): Promise<SkillFetchResult> {
  const normalized = normalizeOwnerRepo(ownerRepo);

  if (!normalized) {
    // Caller should have validated already; treat as unreachable defensively.
    return { ok: false, reason: 'unreachable' };
  }

  const doFetch = options.fetchImpl ?? fetch;

  let sawOnly404 = true;

  for (const file of SKILL_INSTRUCTION_FILES) {
    const url = buildRawUrl(normalized, file);

    // Defense-in-depth: refuse anything that isn't the exact raw host over https.
    if (!isAllowedGithubRawUrl(url)) {
      return { ok: false, reason: 'unreachable' };
    }

    try {
      const response = await doFetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'text/plain, text/markdown, */*' },
      });

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        sawOnly404 = false;
        continue;
      }

      const body = (await response.text()).slice(0, MAX_INSTRUCTIONS_CHARS).trim();

      if (body.length > 0) {
        return { ok: true, instructions: body, source: file };
      }

      // 200 but empty file — keep trying the next candidate.
    } catch {
      // Network error / timeout / redirect refused.
      sawOnly404 = false;
    }
  }

  return { ok: false, reason: sawOnly404 ? 'private_or_missing' : 'unreachable' };
}
