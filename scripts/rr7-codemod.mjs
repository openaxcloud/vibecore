/**
 * One-shot codemod: Remix v2 -> React Router 7 (framework mode) import surface.
 *
 * Mechanical, idempotent-ish transforms over app/**:
 *  1. Rewrite module specifiers '@remix-run/react' and '@remix-run/cloudflare'
 *     (and '@remix-run/node' as a value/type source) to 'react-router'.
 *  2. Rewrite the named `json` import to `data as json`. Under single-fetch,
 *     react-router's `data()` is the drop-in replacement for `json()` for both
 *     the plain and the `{ status, headers }` cases, and aliasing back to
 *     `json` keeps all 500+ call sites untouched and avoids shadowing collisions
 *     with the many local `const data = useLoaderData()` / `await res.json()`.
 *  3. Leave RemixServer / RemixBrowser alone here — entry.{server,client} are
 *     rewritten by hand (they need ServerRouter / HydratedRouter from a
 *     different subpath and a new render signature).
 *
 * Skips:
 *  - entry.server.tsx, entry.client.tsx, root.tsx (hand-edited)
 *  - *.spec.ts / *.spec.tsx are still transformed (they import the same hooks),
 *    which is fine and keeps them compiling.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const HAND_EDITED = new Set([
  'app/entry.server.tsx',
  'app/entry.client.tsx',
  'app/root.tsx',
]);

const REMIX_SPECIFIERS = ['@remix-run/react', '@remix-run/cloudflare', '@remix-run/node'];

function listFiles() {
  const out = execSync(`git ls-files 'app/*.ts' 'app/*.tsx'`, { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

let filesTouched = 0;
let importRewrites = 0;
let jsonImportAliases = 0;

const importStmtRe =
  /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"](@remix-run\/(?:react|cloudflare|node))['"]\s*;?/g;

for (const rel of listFiles()) {
  if (HAND_EDITED.has(rel)) continue;
  const path = `${ROOT}/${rel}`;
  let src;
  try {
    src = readFileSync(path, 'utf8');
  } catch {
    continue;
  }
  if (!REMIX_SPECIFIERS.some((s) => src.includes(s))) continue;

  const original = src;

  src = src.replace(importStmtRe, (stmt) => {
    importRewrites += 1;
    let next = stmt;

    // Alias a bare named `json` to `data as json` inside this import.
    // Handles: `{ json }`, `{ json, redirect }`, `{ redirect, json }`,
    // `{ type Foo, json }`. Word-boundary, not `json as x`, not `.json`.
    next = next.replace(/(^|[\s{,])json(\s*[},])/g, (m, pre, post) => {
      jsonImportAliases += 1;
      return `${pre}data as json${post}`;
    });

    // Rewrite the specifier to react-router.
    next = next.replace(/(['"])@remix-run\/(?:react|cloudflare|node)\1/, "'react-router'");
    return next;
  });

  if (src !== original) {
    writeFileSync(path, src, 'utf8');
    filesTouched += 1;
  }
}

console.log(JSON.stringify({ filesTouched, importRewrites, jsonImportAliases }, null, 2));
