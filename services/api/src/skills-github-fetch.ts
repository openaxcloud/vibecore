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
export const MAX_INSTRUCTIONS_BYTES = 200 * 1024;

/** Internal protocol codes, localized by the route before reaching the UI. */
export enum SkillInstructionContentFailure {
  TooLarge = 'too_large',
  InvalidContent = 'invalid_content',
}

const FETCH_TIMEOUT_MS = 6_000;

export type SkillFetchResult =
  | { ok: true; instructions: string; source: string }

  /** Every candidate file 404'd — repo is private, missing, or has no instructions. */
  | { ok: false; reason: 'private_or_missing' }

  /** Network error, timeout, or a non-404 error status. */
  | { ok: false; reason: 'unreachable' }

  /** A successful file response was unsafe/incomplete; never hide it with a fallback. */
  | { ok: false; reason: SkillInstructionContentFailure };

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

/** Read complete bounded UTF-8 instructions; never slice away required resource references. */
async function readInstructions(
  response: Response,
): Promise<{ ok: true; content: string } | { ok: false; reason: SkillInstructionContentFailure }> {
  const declaredBytes = Number(response.headers?.get('content-length'));

  if (declaredBytes > MAX_INSTRUCTIONS_BYTES) {
    await response.body?.cancel();
    return { ok: false, reason: SkillInstructionContentFailure.TooLarge };
  }

  let content: string;

  if (response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const fragments: string[] = [];

    let bytes = 0;
    let chars = 0;

    try {
      for (;;) {
        const chunk = await reader.read();

        if (chunk.done) {
          break;
        }

        bytes += chunk.value.byteLength;

        if (bytes > MAX_INSTRUCTIONS_BYTES) {
          await reader.cancel();
          return { ok: false, reason: SkillInstructionContentFailure.TooLarge };
        }

        let text: string;

        try {
          text = decoder.decode(chunk.value, { stream: true });
        } catch {
          await reader.cancel();
          return { ok: false, reason: SkillInstructionContentFailure.InvalidContent };
        }

        chars += text.length;

        if (chars > MAX_INSTRUCTIONS_CHARS) {
          await reader.cancel();
          return { ok: false, reason: SkillInstructionContentFailure.TooLarge };
        }

        fragments.push(text);
      }

      try {
        fragments.push(decoder.decode());
      } catch {
        return { ok: false, reason: SkillInstructionContentFailure.InvalidContent };
      }

      content = fragments.join('');
    } catch {
      /*
       * A failed stream after HTTP 200 is incomplete content, not permission to
       * install a different candidate which may omit its required references.
       */
      return { ok: false, reason: SkillInstructionContentFailure.InvalidContent };
    } finally {
      reader.releaseLock();
    }
  } else {
    /*
     * A real Response without a stream has no body. Keep the text-only fetch
     * adapter contract used by route tests, validating its complete string too.
     */
    content = await response.text();
  }

  if (content.length > MAX_INSTRUCTIONS_CHARS || Buffer.byteLength(content, 'utf8') > MAX_INSTRUCTIONS_BYTES) {
    return { ok: false, reason: SkillInstructionContentFailure.TooLarge };
  }

  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(content)) {
    return { ok: false, reason: SkillInstructionContentFailure.InvalidContent };
  }

  return { ok: true, content };
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

      // An unsolicited partial response cannot certify a complete manifest.
      if (response.status !== 200 || response.headers?.has('content-range')) {
        await response.body?.cancel();
        return { ok: false, reason: SkillInstructionContentFailure.InvalidContent };
      }

      const read = await readInstructions(response);

      if (!read.ok) {
        return read;
      }

      const body = read.content.trim();

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
