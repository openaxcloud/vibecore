import { posix } from 'node:path';

export const MAX_SKILL_RESOURCE_PATH_CHARS = 1_024;
export const MAX_SKILL_RESOURCE_DEPTH = 8;
export const MAX_SKILL_RESOURCE_CHARS = 256_000;

const CONTROL_OR_BIDI_RE = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ENCODED_SEPARATOR_OR_DOT_RE = /%(?:2e|2f|5c)/i;
const FORBIDDEN_SEGMENTS = new Set(['.git', '.ssh', 'node_modules']);

export type SkillResourcePathResult =
  | { ok: true; path: string }
  | { ok: false; code: string; reason: string };

/** Validate a portable, skill-root-relative resource path without touching disk. */
export function validateSkillResourcePath(input: string): SkillResourcePathResult {
  if (typeof input !== 'string' || input.length === 0) {
    return { ok: false, code: 'RESOURCE_PATH_EMPTY', reason: 'Resource path must not be empty.' };
  }

  if (input.length > MAX_SKILL_RESOURCE_PATH_CHARS) {
    return { ok: false, code: 'RESOURCE_PATH_TOO_LONG', reason: 'Resource path exceeds the safety limit.' };
  }

  if (
    input.startsWith('/') ||
    input.startsWith('~') ||
    input.includes('\\') ||
    /^[a-zA-Z]:/.test(input) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(input)
  ) {
    return { ok: false, code: 'RESOURCE_PATH_ABSOLUTE', reason: 'Resource path must be portable and relative.' };
  }

  if (CONTROL_OR_BIDI_RE.test(input) || ENCODED_SEPARATOR_OR_DOT_RE.test(input)) {
    return { ok: false, code: 'RESOURCE_PATH_UNSAFE_ENCODING', reason: 'Resource path contains unsafe characters.' };
  }

  const segments = input.split('/');

  if (
    segments.length > MAX_SKILL_RESOURCE_DEPTH ||
    segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.length > 255)
  ) {
    return { ok: false, code: 'RESOURCE_PATH_TRAVERSAL', reason: 'Resource path is too deep or contains traversal.' };
  }

  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment)) || input === '.env') {
    return { ok: false, code: 'RESOURCE_PATH_FORBIDDEN', reason: 'Resource path targets a protected location.' };
  }

  if (input === 'SKILL.md') {
    return {
      ok: false,
      code: 'RESOURCE_PATH_INSTRUCTIONS',
      reason: 'Use skill activation to read SKILL.md instructions.',
    };
  }

  return { ok: true, path: segments.join('/') };
}

/**
 * Resolve a validated resource lexically beneath a skill root. Filesystem-backed
 * callers must additionally compare realpath(root) and realpath(candidate) to
 * reject symlinks; FileMap-backed callers have no symlink entry type.
 */
export function resolveSkillResourceLocation(skillRoot: string, input: string): SkillResourcePathResult {
  const validated = validateSkillResourcePath(input);

  if (!validated.ok) {
    return validated;
  }

  const normalizedRoot = posix.normalize(skillRoot).replace(/\/$/, '');
  const candidate = posix.normalize(posix.join(normalizedRoot, validated.path));

  if (!candidate.startsWith(`${normalizedRoot}/`)) {
    return { ok: false, code: 'RESOURCE_PATH_ESCAPE', reason: 'Resource path escapes the skill directory.' };
  }

  return { ok: true, path: candidate };
}
