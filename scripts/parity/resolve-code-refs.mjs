/**
 * resolve-code-refs — the machine that turns a human `codeRefs` string into
 * EXACT git-tracked paths (P0-B-01 overlay verifiability).
 *
 * The overlay's builtState (CODED/INTEGRATED/PROVEN/PARTIAL/NOT_STARTED) is only
 * trustworthy if every "this is built here" reference points at code that
 * actually exists in the tree. This resolver is the single source of that truth:
 * it accepts ONLY files that `git ls-files` tracks — a hand-waved or hallucinated
 * path resolves to nothing and the generator/validator fail on it.
 *
 * A `codeRefs` string is `;`-separated segments; each segment may carry a path
 * token plus prose (a symbol `#anchor`, a `:line` span, a `(route)` annotation).
 * We classify every whitespace token of every segment:
 *   - route annotation  — parenthetical, or a bare `/route/path` with no file
 *                         extension: NOT a file claim, ignored for resolution;
 *   - path token        — contains `/` or ends in `.ext` (optionally `:line`,
 *                         `#anchor`): MUST resolve to a tracked file/dir.
 *
 * Resolution of a path token (after stripping `:line` and `#anchor`):
 *   1. exact tracked path;
 *   2. `…/schema.prisma` → the canonical `packages/database/prisma/schema.prisma`;
 *   3. a tracked directory (has tracked children) — a legitimate "spans this dir";
 *   4. unique tracked basename (prefer non-generated, non-spec);
 *   5. Remix `$param` shorthand: `projectId.x.tsx` → `…$projectId.x.tsx`.
 * Anything else is UNRESOLVED.
 */
import { execSync } from 'node:child_process';

const CANONICAL_PRISMA = 'packages/database/prisma/schema.prisma';

/** All git-tracked paths, plus the set of tracked directories, from repoRoot. */
export function loadGitFileset(repoRoot) {
  const files = execSync('git ls-files', { cwd: repoRoot, maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split('\n')
    .filter(Boolean);

  const fileSet = new Set(files);
  const byBase = new Map();
  const dirSet = new Set();

  for (const f of files) {
    const base = f.slice(f.lastIndexOf('/') + 1);
    (byBase.get(base) ?? byBase.set(base, []).get(base)).push(f);

    const parts = f.split('/');

    for (let i = 1; i < parts.length; i += 1) {
      dirSet.add(parts.slice(0, i).join('/'));
    }
  }

  return { fileSet, byBase, dirSet };
}

/** Is a token a route annotation rather than a file-path claim? */
function isRouteAnnotation(token) {
  const t = token.trim();

  if (t.startsWith('(') || t.endsWith(')')) {
    return true;
  }

  /*
   * Bare route (/import/gitlab, /scim/v2/:orgId/Users) — a slash path with no
   * file extension on its last segment.
   */
  if (t.startsWith('/') && !/\.\w+$/.test(t.replace(/:[\w:-]+$/, ''))) {
    return true;
  }

  return false;
}

/** Does a whitespace token look like a file-path claim at all? */
function isPathLike(token) {
  const t = token.replace(/[(),]/g, '');

  if (!t) {
    return false;
  }

  // has a slash, OR ends in `.ext` (optionally `:line` / `#anchor`).
  return t.includes('/') || /\.\w+(:[\d,\-]+)?(#[\w-]+)?$/.test(t);
}

/** Resolve ONE path token to a tracked path, or null. */
export function resolveToken(token, gitset) {
  let p = token.replace(/[(),]/g, '').split('#')[0];
  p = p
    .replace(/:[\d,\-]+$/, '')
    .trim()
    .replace(/\/+$/, '');

  if (!p) {
    return null;
  }

  if (gitset.fileSet.has(p)) {
    return p;
  }

  if (p.endsWith('schema.prisma') && gitset.fileSet.has(CANONICAL_PRISMA)) {
    return CANONICAL_PRISMA;
  }

  if (gitset.dirSet.has(p)) {
    return p;
  }

  const base = p.slice(p.lastIndexOf('/') + 1);
  const cands = gitset.byBase.get(base);

  if (cands && cands.length > 0) {
    const preferred = cands.filter(
      (f) => !f.includes('/generated/') && !f.endsWith('.spec.ts') && !f.endsWith('.test.ts'),
    );
    return (preferred.length > 0 ? preferred : cands)[0];
  }

  if (base.includes('projectId')) {
    const alt = base.replace('projectId', '$projectId');
    const altCands = gitset.byBase.get(alt);

    if (altCands && altCands.length > 0) {
      return altCands[0];
    }

    const suffixMatch = [...gitset.fileSet].find((f) => f.endsWith(alt));

    if (suffixMatch) {
      return suffixMatch;
    }
  }

  return null;
}

/**
 * Resolve a whole `codeRefs` string. Returns:
 *   { resolved: [trackedPath…], unresolved: [rawToken…], routes: [annotation…] }
 * `resolved` is deduped; `unresolved` is every path-like token that pointed at
 * nothing tracked — a non-empty list on a built item is a fatal overlay lie.
 */
export function resolveCodeRefs(codeRefs, gitset) {
  const resolved = [];
  const unresolved = [];
  const routes = [];
  const seen = new Set();

  for (const segment of String(codeRefs ?? '').split(';')) {
    for (const raw of segment.trim().split(/\s+/)) {
      const token = raw.trim();

      if (!token) {
        continue;
      }

      if (isRouteAnnotation(token)) {
        routes.push(token);
        continue;
      }

      if (!isPathLike(token)) {
        continue;
      }

      const hit = resolveToken(token, gitset);

      if (hit) {
        if (!seen.has(hit)) {
          seen.add(hit);
          resolved.push(hit);
        }
      } else {
        unresolved.push(token);
      }
    }
  }

  return { resolved, unresolved, routes };
}
