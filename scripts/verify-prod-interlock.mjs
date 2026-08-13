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
import ts from 'typescript';

/** The production entrypoint — the same file `pnpm --filter @vibecore/api build` compiles. */
export const PROD_ENTRYPOINT = 'services/api/src/server.ts';

/** The control that must be present in shipping code. */
export const INTERLOCK_TOKEN = 'DEPLOYMENT_ACCESS_ACTIVATION_ENABLED';

/** The owner-only mutation route whose password transition must fail closed. */
export const INTERLOCK_ROUTE = '/projects/:projectId/deployments/:deploymentId/access';

/** Stable response code emitted when the deploy-time barrier is not armed. */
export const INTERLOCK_FAILURE_CODE = 'DEPLOYMENT_ACCESS_ACTIVATION_DISABLED';

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

function unwrapParentheses(node) {
  let current = node;

  while (ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }

  return current;
}

function isStringValue(node, value) {
  const current = unwrapParentheses(node);
  return (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) && current.text === value;
}

function isProcessEnvAccess(node, token) {
  const current = unwrapParentheses(node);

  if (!ts.isPropertyAccessExpression(current) || current.name.text !== token) {
    return false;
  }

  const env = unwrapParentheses(current.expression);
  return (
    ts.isPropertyAccessExpression(env) &&
    env.name.text === 'env' &&
    ts.isIdentifier(unwrapParentheses(env.expression)) &&
    unwrapParentheses(env.expression).text === 'process'
  );
}

function isBodyModeAccess(node) {
  const current = unwrapParentheses(node);
  const target = ts.isPropertyAccessExpression(current) ? unwrapParentheses(current.expression) : undefined;
  return (
    ts.isPropertyAccessExpression(current) &&
    current.name.text === 'mode' &&
    ts.isIdentifier(target) &&
    target.text === 'body'
  );
}

function isStrictComparison(node, operator, leftPredicate, rightValue) {
  const current = unwrapParentheses(node);

  if (!ts.isBinaryExpression(current) || current.operatorToken.kind !== operator) {
    return false;
  }

  return (
    (leftPredicate(current.left) && isStringValue(current.right, rightValue)) ||
    (leftPredicate(current.right) && isStringValue(current.left, rightValue))
  );
}

function conditionConjuncts(node) {
  const current = unwrapParentheses(node);

  if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return [...conditionConjuncts(current.left), ...conditionConjuncts(current.right)];
  }

  return [current];
}

function hasDescendant(node, predicate) {
  if (predicate(node)) {
    return true;
  }

  let found = false;
  ts.forEachChild(node, (child) => {
    if (!found && hasDescendant(child, predicate)) {
      found = true;
    }
  });
  return found;
}

function is503ReplyCall(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return (
    ts.isIdentifier(unwrapParentheses(node.expression.expression)) &&
    unwrapParentheses(node.expression.expression).text === 'reply' &&
    node.expression.name.text === 'code' &&
    node.arguments.length === 1 &&
    ts.isNumericLiteral(unwrapParentheses(node.arguments[0])) &&
    Number(unwrapParentheses(node.arguments[0]).text) === 503
  );
}

function isFailureCodeProperty(node) {
  if (!ts.isPropertyAssignment(node) || !isStringValue(node.initializer, INTERLOCK_FAILURE_CODE)) {
    return false;
  }

  return (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === 'code';
}

function isBlockingFailureBranch(statement) {
  if (!ts.isBlock(statement) || statement.statements.length !== 1) {
    return false;
  }

  const candidate = statement.statements[0];

  if (!ts.isReturnStatement(candidate) || !candidate.expression) {
    return false;
  }

  return (
    hasDescendant(candidate.expression, is503ReplyCall) && hasDescendant(candidate.expression, isFailureCodeProperty)
  );
}

function isExecutableInterlock(statement, token) {
  if (!ts.isIfStatement(statement) || !isBlockingFailureBranch(statement.thenStatement)) {
    return false;
  }

  const conjuncts = conditionConjuncts(statement.expression);
  if (conjuncts.length !== 2) {
    return false;
  }

  const gatesPasswordActivation = conjuncts.some((node) =>
    isStrictComparison(node, ts.SyntaxKind.EqualsEqualsEqualsToken, isBodyModeAccess, 'password'),
  );
  const failsClosedUnlessArmed = conjuncts.some((node) =>
    isStrictComparison(
      node,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      (candidate) => isProcessEnvAccess(candidate, token),
      '1',
    ),
  );

  return gatesPasswordActivation && failsClosedUnlessArmed;
}

function isAccessRouteRegistration(node) {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  if (
    node.expression.name.text !== 'post' ||
    node.arguments.length < 2 ||
    !isStringValue(node.arguments[0], INTERLOCK_ROUTE)
  ) {
    return false;
  }

  const handler = unwrapParentheses(node.arguments[1]);
  const statement = node.parent;
  const containingBlock = ts.isExpressionStatement(statement) ? statement.parent : undefined;
  const containingFunction = containingBlock && ts.isBlock(containingBlock) ? containingBlock.parent : undefined;

  return (
    (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) &&
    ts.isBlock(handler.body) &&
    ts.isExpressionStatement(statement) &&
    ts.isBlock(containingBlock) &&
    ts.isFunctionDeclaration(containingFunction) &&
    containingFunction.name?.text === 'buildApiApp'
  );
}

/**
 * Locate the real fail-closed control in the production AST.
 *
 * This deliberately certifies much more than token presence: the token must be
 * read by the owner access route, in the same top-level condition that selects
 * mode=password; the unarmed branch must directly return a 503 carrying the
 * stable failure code; and that branch must precede updateDeployment. Comments,
 * strings, simple reads and diagnostic-only conditions cannot satisfy it.
 */
function executableInterlockControls(repoRoot, files, token) {
  const controls = [];

  for (const file of files) {
    const absolute = resolve(repoRoot, file);
    let source;

    try {
      source = readFileSync(absolute, 'utf8');
    } catch {
      continue;
    }

    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const visit = (node) => {
      if (isAccessRouteRegistration(node)) {
        const handler = unwrapParentheses(node.arguments[1]);
        const statements = handler.body.statements;
        const firstMutation = statements.findIndex((statement) =>
          hasDescendant(
            statement,
            (candidate) =>
              ts.isCallExpression(candidate) &&
              ts.isPropertyAccessExpression(candidate.expression) &&
              candidate.expression.name.text === 'updateDeployment',
          ),
        );
        const controlIndex = statements.findIndex((statement) => isExecutableInterlock(statement, token));

        if (controlIndex >= 0 && firstMutation >= 0 && controlIndex < firstMutation) {
          const location = sourceFile.getLineAndCharacterOfPosition(statements[controlIndex].getStart(sourceFile));
          controls.push({
            file,
            route: INTERLOCK_ROUTE,
            line: location.line + 1,
            beforeMutation: true,
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
  }

  return controls;
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

  // 3. Record textual carriers for diagnostics, but never treat them as proof.
  const tokenCarriers = files.filter((f) => {
    try {
      return readFileSync(resolve(repoRoot, f), 'utf8').includes(token);
    } catch {
      return false;
    }
  });

  // 4. THE POINT: prove an executable, fail-closed control in the real route.
  const controls = executableInterlockControls(repoRoot, files, token);
  const carriers = [...new Set(controls.map((control) => control.file))].sort();

  if (carriers.length === 0) {
    failures.push(
      `${token} is NOT present anywhere in the production module graph as an executable fail-closed control ` +
        `on ${INTERLOCK_ROUTE} before updateDeployment (${files.length} files reachable from ${entry}). ` +
        `Text in tests, comments, strings or non-blocking expressions must never count as the control.`,
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
      tokenCarriers,
      carriers,
      controls,
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
