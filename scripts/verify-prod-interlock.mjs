#!/usr/bin/env node
/*
 * P104 / SEC-9 — prove the activation interlock ships in the PRODUCTION bundle.
 *
 * WHY THIS EXISTS (the defect it replaces)
 * ----------------------------------------
 * deploy-main.yml used to decide "is this tree post-cutover?" with:
 *
 *     grep -rq 'DEPLOYMENT_ACCESS_ACTIVATION_ENABLED' services/api/src
 *
 * That grep walks a DIRECTORY, and the directory contains the tests. The string
 * lives in deployment-password.spec.ts as well as in app.ts, so deleting the
 * interlock from the production route while leaving the spec file in place still
 * matched. The workflow would then believe the control was present, skip the
 * drain barrier as "steady state", and arm activation against an api that has no
 * interlock at all — a false-positive cutover.
 *
 * THE FIX IS NOT `--exclude=*.spec.ts`. An exclusion list is another denylist:
 * the next test helper, fixture or doc string re-opens it. Instead this script
 * asks the only question that actually matters — *does the code that SHIPS
 * contain the control?* — by walking the real production module graph from the
 * production entrypoint (services/api/src/server.ts) and looking only inside the
 * files that are genuinely reachable from it. A spec file is not reachable from
 * server.ts, so it cannot vote. Nothing has to be excluded by name.
 *
 * Belt AND braces: the graph is also asserted to contain NO test file. If a spec
 * ever becomes reachable from the production entrypoint that is a real defect in
 * its own right, and this fails loudly instead of quietly widening the check.
 *
 * EXACT-SHA GATE
 * --------------
 * A verdict is only meaningful for the exact tree it was computed on, so the
 * script emits an attestation binding {sha, entrypoint, graph digest, verdict}.
 * deploy-main.yml passes the SHA it is deploying via --expect-sha; a mismatch is
 * a hard failure, so a verdict can never be carried over from another commit.
 *
 * Run:
 *   node scripts/verify-prod-interlock.mjs [--expect-sha <sha>] [--json <path>]
 * Exit 0 = the interlock is in the production bundle for this exact SHA.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

/** The production entrypoint — the same file `pnpm --filter @vibecore/api build` compiles. */
export const PROD_ENTRYPOINT = 'services/api/src/server.ts';

/** The control that must be present in shipping code. */
export const INTERLOCK_TOKEN = 'DEPLOYMENT_ACCESS_ACTIVATION_ENABLED';

/**
 * A graph smaller than this means the walker itself broke (bad entrypoint, a
 * resolution regression). Without this floor a broken walker returns an empty
 * graph, finds no test files in it, and could only ever fail "interlock missing"
 * — i.e. it would fail for the wrong reason, or worse, a future refactor could
 * make an empty graph look like a pass. The real api graph is many hundreds of
 * files; 50 is a deliberately loose sanity floor, not a target.
 */
export const MIN_PLAUSIBLE_GRAPH_SIZE = 50;

const TEST_FILE_RE = /(^|\/)(tests?|__tests__)\/|\.(spec|test)\.[cm]?tsx?$/;

/**
 * Walk the production module graph from `entry`, following ONLY relative
 * specifiers (./ and ../). Package imports are out of scope: the interlock lives
 * in services/api, and following node_modules would be both slow and irrelevant.
 *
 * TypeScript NodeNext source imports carry a `.js` extension that resolves to the
 * `.ts` file on disk, so specifiers are mapped back accordingly.
 *
 * @param {string} repoRoot
 * @param {string} entry repo-relative path
 * @returns {{files: string[], unresolved: {from: string, specifier: string}[]}}
 */
export function productionModuleGraph(repoRoot, entry = PROD_ENTRYPOINT) {
  const entryAbs = resolve(repoRoot, entry);

  if (!existsSync(entryAbs)) {
    throw new Error(`production entrypoint not found: ${entry}`);
  }

  const seen = new Set([entryAbs]);
  const queue = [entryAbs];
  const unresolved = [];

  /*
   * Three shapes, all of which really pull a module into the bundle:
   *   from '...'      — `import x from`, `import {x} from`, `export {x} from`
   *   import('...')   — dynamic import
   *   import '...'    — SIDE-EFFECT import, no bindings and no `from`
   *
   * The side-effect form is easy to forget and was missing from the first cut of
   * this walker; a fixture caught it. Missing it under-reports the graph, which
   * both weakens the "no test file is reachable" assertion and could hide the
   * interlock if it ever lived in a side-effect-only module.
   */
  const specifierRe = /(?:from\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.[^'"]*)['"]/g;

  while (queue.length > 0) {
    const file = queue.pop();
    let source;

    try {
      source = readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    for (const match of source.matchAll(specifierRe)) {
      const specifier = match[1];
      const resolved = resolveRelative(dirname(file), specifier);

      if (!resolved) {
        unresolved.push({ from: relative(repoRoot, file), specifier });
        continue;
      }

      if (!seen.has(resolved)) {
        seen.add(resolved);
        queue.push(resolved);
      }
    }
  }

  return {
    files: [...seen].map((f) => relative(repoRoot, f)).sort(),
    unresolved,
  };
}

const dirCache = new Map();

/**
 * `statSync` is case-INSENSITIVE on macOS and case-SENSITIVE on Linux, so a
 * specifier like `./App` happily resolves onto `app.ts` on a developer laptop and
 * not at all in CI. That divergence matters twice over: it puts a phantom file in
 * the graph, and it makes the graph digest — which the exact-SHA attestation is
 * built on — depend on the machine that computed it.
 *
 * (This is not hypothetical: app.ts embeds a generated Vite app in a TEMPLATE
 * LITERAL containing `import App from './App'`. A textual scan cannot tell that
 * apart from a real import, so the resolver has to be the strict one.)
 *
 * Resolve through an exact-case directory listing so both platforms agree.
 */
function existsWithExactCase(path) {
  const dir = dirname(path);
  let entries = dirCache.get(dir);

  if (!entries) {
    try {
      entries = new Set(readdirSync(dir));
    } catch {
      entries = new Set();
    }

    dirCache.set(dir, entries);
  }

  if (!entries.has(basename(path))) {
    return false;
  }

  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Map a relative TS/NodeNext specifier onto a real file on disk. */
function resolveRelative(fromDir, specifier) {
  const base = resolve(fromDir, specifier);
  const withoutJs = base.replace(/\.js$/, '');
  const candidates = [
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    `${withoutJs}.mts`,
    `${withoutJs}.cts`,
    base,
    join(withoutJs, 'index.ts'),
    join(withoutJs, 'index.tsx'),
  ];

  for (const candidate of candidates) {
    if (existsWithExactCase(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/**
 * Blank out comments and string/template literals, preserving offsets and line
 * structure so what remains is only EXECUTABLE source.
 *
 * Hermetic on purpose — no TypeScript/parser import. The `build-and-deploy` job
 * checks out the repo and never runs an install, so anything this script needs
 * from node_modules simply would not be there (the repo already learned this:
 * see the "HERMETIC — pure Python 3 stdlib" note on
 * scripts/validate-image-signing-wired.py). A single-pass scanner is enough for
 * the one question being asked.
 */
export function stripCommentsAndStrings(source) {
  const out = source.split('');
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to && k < n; k += 1) {
      if (out[k] !== '\n') {
        out[k] = ' ';
      }
    }
  };

  /*
   * A regex literal and a division both start with `/`. Decide by the previous
   * significant character: after a value (identifier, digit, `)`, `]`) a slash
   * divides; anywhere else it opens a regex. Without this, `/process.env.X !== /`
   * survives stripping and CERTIFIES A CONTROL THAT DOES NOT EXIST.
   */
  const regexCanStartAfter = (ch) => ch === '' || !/[A-Za-z0-9_$)\]]/.test(ch);

  let i = 0;
  let mode = 'code';
  let templateStart = -1;
  let braceDepth = 0;
  const templateReturnDepth = [];
  let lastSignificant = '';

  while (i < n) {
    const c = source[i];
    const d = source[i + 1];

    if (mode === 'template') {
      if (c === '\\') {
        i += 2;
        continue;
      }

      if (c === '`') {
        blank(templateStart, i);
        mode = 'code';
        lastSignificant = '`';
        i += 1;
        continue;
      }

      // `${` opens real CODE inside the template — and it may contain another
      // template, which is why this is a stack and not a boolean.
      if (c === '$' && d === '{') {
        blank(templateStart, i);
        templateReturnDepth.push(braceDepth);
        braceDepth += 1;
        mode = 'code';
        i += 2;
        continue;
      }

      i += 1;
      continue;
    }

    if (c === '/' && d === '/') {
      let j = i + 2;
      while (j < n && source[j] !== '\n') j += 1;
      blank(i, j);
      i = j;
      continue;
    }

    if (c === '/' && d === '*') {
      let j = i + 2;
      while (j < n && !(source[j] === '*' && source[j + 1] === '/')) j += 1;
      blank(i, Math.min(j + 2, n));
      i = j + 2;
      continue;
    }

    if (c === '/' && regexCanStartAfter(lastSignificant)) {
      let j = i + 1;
      let inClass = false;

      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }

        if (source[j] === '[') inClass = true;
        else if (source[j] === ']') inClass = false;
        else if (source[j] === '/' && !inClass) break;
        else if (source[j] === '\n') break;

        j += 1;
      }

      blank(i, Math.min(j + 1, n));
      lastSignificant = '/';
      i = j + 1;
      continue;
    }

    if (c === "'" || c === '"') {
      let j = i + 1;

      while (j < n) {
        if (source[j] === '\\') {
          j += 2;
          continue;
        }

        if (source[j] === c || source[j] === '\n') break;

        j += 1;
      }

      blank(i + 1, j);
      lastSignificant = '"';
      i = j + 1;
      continue;
    }

    if (c === '`') {
      mode = 'template';
      templateStart = i + 1;
      i += 1;
      continue;
    }

    if (c === '{') {
      braceDepth += 1;
      lastSignificant = c;
      i += 1;
      continue;
    }

    if (c === '}') {
      braceDepth -= 1;

      if (templateReturnDepth.length > 0 && braceDepth === templateReturnDepth[templateReturnDepth.length - 1]) {
        templateReturnDepth.pop();
        mode = 'template';
        templateStart = i + 1;
      }

      lastSignificant = c;
      i += 1;
      continue;
    }

    if (!/\s/.test(c)) {
      lastSignificant = c;
    }

    i += 1;
  }

  return out.join('');
}

/**
 * True iff `token` is read from the environment in EXECUTABLE code and that read
 * feeds a comparison — i.e. the control actually exists, rather than the name
 * merely appearing somewhere in the file.
 *
 * Why this replaced a substring match: the certification claims "the control
 * ships". A `// TODO: re-add the DEPLOYMENT_ACCESS_ACTIVATION_ENABLED check` left
 * behind by a revert, or an audit string mentioning it, satisfied `includes()`
 * and got certified — precisely the shape a careless revert leaves. Text is not
 * a control.
 *
 * Accepts both `process.env.TOKEN` and `process.env['TOKEN']`; the bracket form
 * is normalised first so blanking string literals cannot erase it.
 */
export function hasExecutableEnvGuard(source, token) {
  const normalised = source.replace(
    new RegExp(String.raw`process\s*\.\s*env\s*\[\s*(['"\`])${token}\1\s*\]`, 'g'),
    `process.env.${token}`,
  );
  const code = stripCommentsAndStrings(normalised);
  const readRe = new RegExp(String.raw`process\s*\.\s*env\s*\.\s*${token}`, 'g');

  for (const match of code.matchAll(readRe)) {
    /*
     * The read must be COMPARED, not merely mentioned. Assignment
     * (`process.env.X = '1'`, which is what a test does to set it up) is not a
     * control and must not certify anything. Look just past the read.
     */
    const after = code.slice(match.index + match[0].length, match.index + match[0].length + 24);

    if (/^\s*(===|!==|==|!=)/.test(after)) {
      return true;
    }
  }

  return false;
}

/**
 * @returns {{ok: boolean, failures: string[], attestation: object}}
 */
export function verifyInterlock(
  repoRoot,
  { sha, entry = PROD_ENTRYPOINT, token = INTERLOCK_TOKEN, minGraphSize = MIN_PLAUSIBLE_GRAPH_SIZE } = {},
) {
  dirCache.clear();

  const { files, unresolved } = productionModuleGraph(repoRoot, entry);
  const failures = [];

  // 1. The walker must have actually walked something.
  if (files.length < minGraphSize) {
    failures.push(
      `production module graph has only ${files.length} file(s) (< ${minGraphSize}) — the walker is broken, refusing to certify anything`,
    );
  }

  // 2. No test file may be reachable from the production entrypoint.
  const testsInGraph = files.filter((f) => TEST_FILE_RE.test(f));

  if (testsInGraph.length > 0) {
    failures.push(`test file(s) reachable from the production entrypoint: ${testsInGraph.join(', ')}`);
  }

  // 3. THE POINT: the interlock must be EXECUTABLE code in the shipping bundle.
  const carriers = files.filter((f) => {
    try {
      return hasExecutableEnvGuard(readFileSync(resolve(repoRoot, f), 'utf8'), token);
    } catch {
      return false;
    }
  });

  if (carriers.length === 0) {
    failures.push(
      `${token} is NOT present anywhere in the production module graph (${files.length} files reachable from ${entry}). ` +
        `It may still exist in tests — that does not ship and must never count as the control being present.`,
    );
  }

  const digest = createHash('sha256').update(files.join('\n')).digest('hex');

  return {
    ok: failures.length === 0,
    failures,
    attestation: {
      sha: sha ?? null,
      entrypoint: entry,
      token,
      graphFileCount: files.length,
      graphDigest: `sha256:${digest}`,
      carriers,
      testFilesInGraph: testsInGraph,
      unresolvedSpecifierCount: unresolved.length,
      verdict: failures.length === 0 ? 'INTERLOCK_IN_PRODUCTION_BUNDLE' : 'FAILED',
    },
  };
}

function main() {
  const argv = process.argv.slice(2);
  const argOf = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const repoRoot = argOf('--repo-root') ?? process.cwd();
  const expectSha = argOf('--expect-sha');
  const jsonOut = argOf('--json');

  let headSha;

  try {
    headSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    headSha = undefined;
  }

  /*
   * Exact-SHA gate. The verdict describes ONE tree; accepting it for a different
   * commit is how a stale "it was fine last week" certification arms a deploy it
   * never inspected. Prefix comparison so a 10-char short sha matches a full one.
   */
  if (expectSha) {
    if (!headSha) {
      console.error(`::error::--expect-sha ${expectSha} was given but HEAD could not be resolved`);
      process.exit(1);
    }

    const a = headSha.toLowerCase();
    const b = expectSha.toLowerCase();

    if (!a.startsWith(b) && !b.startsWith(a)) {
      console.error(`::error::exact-SHA gate FAILED — verifying ${headSha} but the deploy expects ${expectSha}`);
      process.exit(1);
    }

    console.log(`exact-SHA gate ok: HEAD ${headSha} matches expected ${expectSha}`);
  }

  const { ok, failures, attestation } = verifyInterlock(repoRoot, { sha: headSha });

  console.log(`entrypoint            : ${attestation.entrypoint}`);
  console.log(`files in prod graph   : ${attestation.graphFileCount}`);
  console.log(`graph digest          : ${attestation.graphDigest}`);
  console.log(`test files in graph   : ${attestation.testFilesInGraph.length}`);
  console.log(`interlock carriers    : ${attestation.carriers.join(', ') || '(none)'}`);
  console.log(`verdict               : ${attestation.verdict}`);

  if (jsonOut) {
    writeFileSync(jsonOut, `${JSON.stringify(attestation, null, 2)}\n`);
    console.log(`attestation written   : ${jsonOut}`);
  }

  if (!ok) {
    for (const f of failures) {
      console.error(`::error::${f}`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
