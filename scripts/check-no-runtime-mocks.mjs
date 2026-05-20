import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

/**
 * Identifiers that must not appear in shipped runtime code. The list pairs
 * an English mock-vocabulary (Mock/mock/InMemory/stub/fake/scaffolded) with
 * a small set of Test* class names that have been used historically as
 * production substitutes inside this repo.
 *
 * The regex intentionally matches both casings of `mock` because we have
 * had drift in both directions in the past. Comments are stripped before
 * the test runs (see `stripCommentsForCheck`), so legitimate doc lines
 * referencing the words for clarity are not flagged.
 */
export const BLOCKED_PATTERN =
  /\b(Mock|mock|InMemory|stub|fake|scaffolded)\b|Test(ApiStore|ProjectStorage|GitProvider|EmailProvider|WorkspaceStore|EventBus|WorkspaceK8sClient)/;

export const SCAN_ROOTS = ['app', 'services', 'packages', 'infra'];

const IGNORED_SEGMENTS = new Set(['node_modules', 'dist', 'build', '.vite', 'generated', '__snapshots__']);

const IGNORED_FILE_PATTERNS = [/\.spec\./, /\.test\./, /vitest\.config\./, /\/tests\//, /\/src\/tests\//];

const SCANNED_EXTENSIONS = /\.(ts|tsx|js|jsx|json|yaml|yml|md)$/;

/**
 * Build a parallel array of lines with comment content removed. The line
 * indices are preserved so callers can report accurate line numbers.
 *
 * The stripper understands three forms of comment:
 *   - JSDoc continuation lines whose trimmed text starts with `*`.
 *   - `/* ... *\/` block comments, including multi-line forms.
 *   - `//` line comments to end of line.
 *
 * It deliberately does NOT understand string literals: `"//"` inside a
 * string will still be treated as a line comment. This is acceptable for a
 * mock-identifier scanner because hiding a runtime mock identifier behind
 * a `//` inside a string requires deliberate effort and is easy to spot in
 * review. For everything else the stripper is conservative and only
 * removes characters that are unambiguously inside a comment.
 */
export function stripCommentsForCheck(source) {
  const lines = source.split('\n');
  const stripped = [];
  let insideBlockComment = false;

  for (const line of lines) {
    let text = line;

    if (insideBlockComment) {
      const end = text.indexOf('*/');

      if (end === -1) {
        stripped.push('');
        continue;
      }

      text = text.slice(end + 2);
      insideBlockComment = false;
    }

    while (true) {
      const blockStart = text.indexOf('/*');

      if (blockStart === -1) {
        break;
      }

      const blockEnd = text.indexOf('*/', blockStart + 2);

      if (blockEnd === -1) {
        insideBlockComment = true;
        text = text.slice(0, blockStart);
        break;
      }

      text = text.slice(0, blockStart) + ' ' + text.slice(blockEnd + 2);
    }

    if (/^\s*\*/.test(text)) {
      stripped.push('');
      continue;
    }

    const lineCommentStart = text.indexOf('//');

    if (lineCommentStart !== -1) {
      text = text.slice(0, lineCommentStart);
    }

    stripped.push(text);
  }

  return stripped;
}

/**
 * Returns the list of lines in `source` that contain a banned runtime mock
 * identifier outside of comments.
 */
export function findRuntimeMockViolations(source, filePath = '') {
  const stripped = stripCommentsForCheck(source);
  const original = source.split('\n');
  const violations = [];

  for (let index = 0; index < stripped.length; index += 1) {
    if (BLOCKED_PATTERN.test(stripped[index])) {
      violations.push({ file: filePath, line: index + 1, content: original[index].trim() });
    }
  }

  return violations;
}

/**
 * True when this path should be excluded from the scan (test specs,
 * extension that we do not look at, etc.).
 */
export function shouldIgnoreFile(normalizedPath) {
  if (!SCANNED_EXTENSIONS.test(normalizedPath)) {
    return true;
  }

  return IGNORED_FILE_PATTERNS.some((pattern) => pattern.test(normalizedPath));
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!IGNORED_SEGMENTS.has(entry.name)) {
        yield* walk(path);
      }

      continue;
    }

    if (entry.isFile()) {
      yield path;
    }
  }
}

async function runCli() {
  const violations = [];

  for (const root of SCAN_ROOTS) {
    if (!(await stat(root).catch(() => undefined))) {
      continue;
    }

    for await (const file of walk(root)) {
      const normalized = file.replaceAll('\\', '/');

      if (shouldIgnoreFile(normalized)) {
        continue;
      }

      const source = await readFile(file, 'utf8');
      const found = findRuntimeMockViolations(source, normalized);

      for (const violation of found) {
        violations.push(`${violation.file}:${violation.line}: ${violation.content}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error('Runtime mock/stub/scaffold markers are not allowed:');
    console.error(violations.join('\n'));
    process.exit(1);
  }

  console.log('runtime mock scan clean');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runCli();
}
