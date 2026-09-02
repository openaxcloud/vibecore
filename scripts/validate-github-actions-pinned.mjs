#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const FULL_COMMIT_SHA = /^[0-9a-f]{40}$/;
const FULL_CONTAINER_DIGEST = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/i;
const USES_DIRECTIVE = /\buses:\s*["']?([^\s#"']+)/g;

// These are the exact mutable references temporarily blocked by coordination:
// 15 are owned by Claude's active PR #352; five belong to the legacy preview
// workflow whose Cloudflare egress needs explicit approval before it is
// replaced; four belong to the privileged stable-release workflow pending the
// same explicit approval. The gate allows neither a different ref nor one
// additional use.
// Stale exceptions deliberately fail validation so the debt cannot linger.
const TEMPORARY_EXCEPTIONS = new Map([
  ['.github/workflows/e2e.yml|actions/checkout|v4', 1],
  ['.github/workflows/e2e.yml|actions/setup-node|v4', 1],
  ['.github/workflows/e2e.yml|pnpm/action-setup|v4', 1],
  ['.github/workflows/e2e.yml|actions/upload-artifact|v4', 1],
  ['.github/workflows/electron.yml|actions/checkout|v4', 1],
  ['.github/workflows/electron.yml|actions/setup-node|v4', 1],
  ['.github/workflows/electron.yml|pnpm/action-setup|v4', 1],
  ['.github/workflows/electron.yml|actions/cache|v4', 1],
  ['.github/workflows/electron.yml|actions/upload-artifact|v4', 1],
  ['.github/workflows/electron.yml|actions/download-artifact|v4', 1],
  ['.github/workflows/electron.yml|softprops/action-gh-release|v2', 1],
  ['.github/workflows/terraform.yml|actions/checkout|v4', 1],
  ['.github/workflows/terraform.yml|hashicorp/setup-terraform|v3', 1],
  ['.github/workflows/terraform.yml|google-github-actions/auth|v2', 1],
  ['.github/workflows/terraform.yml|actions/upload-artifact|v4', 1],
  ['.github/workflows/preview.yaml|actions/checkout|v4', 1],
  ['.github/workflows/preview.yaml|cloudflare/pages-action|v1', 1],
  ['.github/workflows/preview.yaml|actions/github-script|v7', 3],
  ['.github/workflows/update-stable.yml|actions/checkout|v4', 1],
  ['.github/workflows/update-stable.yml|actions/setup-node|v4', 1],
  ['.github/workflows/update-stable.yml|pnpm/action-setup|v2', 1],
  ['.github/workflows/update-stable.yml|actions/cache|v4', 1],
]);

export function findUnpinnedActions(source, filename = '<memory>') {
  const findings = [];

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (line.trimStart().startsWith('#')) {
      continue;
    }

    USES_DIRECTIVE.lastIndex = 0;
    let match;

    while ((match = USES_DIRECTIVE.exec(line)) !== null) {
      // Closing braces/commas can follow a scalar in an inline YAML mapping.
      const value = match[1].replace(/[},]+$/, '');

      if (value.startsWith('./')) {
        continue;
      }

      if (value.startsWith('docker://')) {
        if (!FULL_CONTAINER_DIGEST.test(value)) {
          findings.push({
            filename,
            line: index + 1,
            action: value,
            ref: 'mutable-container-image',
            kind: 'container',
          });
        }

        continue;
      }

      const separator = value.lastIndexOf('@');

      // Reject aliases, expressions and malformed values fail-closed. GitHub
      // supports YAML anchors, so checking only literal action@ref strings lets
      // a mutable reference hide behind `uses: *alias`.
      if (separator <= 0) {
        findings.push({
          filename,
          line: index + 1,
          action: value,
          ref: 'missing-or-dynamic-ref',
          kind: 'dynamic',
        });

        continue;
      }

      const action = value.slice(0, separator);
      const ref = value.slice(separator + 1);

      if (!FULL_COMMIT_SHA.test(ref)) {
        findings.push({ filename, line: index + 1, action, ref, kind: 'action' });
      }
    }
  }

  return findings;
}

function yamlFiles(root) {
  const files = [];

  for (const entry of readdirSync(root)) {
    const path = join(root, entry);

    if (statSync(path).isDirectory()) {
      files.push(...yamlFiles(path));
    } else if (['.yml', '.yaml'].includes(extname(entry))) {
      files.push(path);
    }
  }

  return files.sort();
}

function selfTest() {
  const fixture = [
    'steps:',
    '  - uses: actions/checkout@0123456789abcdef0123456789abcdef01234567 # v4',
    '  - uses: ./my-local-action',
    '  - uses: actions/setup-node@v4',
    "  - uses: 'vendor/action@main'",
    '  - uses: docker://alpine:3.20',
    `  - uses: docker://alpine@sha256:${'a'.repeat(64)}`,
    '  - uses: *mutable-action-alias',
    '  - uses: ${{ matrix.action }}',
    '  # example only: uses: vendor/commented@main',
  ].join('\n');
  const findings = findUnpinnedActions(fixture);

  if (
    findings.length !== 5 ||
    findings[0]?.action !== 'actions/setup-node' ||
    findings[0]?.ref !== 'v4' ||
    findings[1]?.action !== 'vendor/action' ||
    findings[1]?.ref !== 'main' ||
    findings[2]?.action !== 'docker://alpine:3.20' ||
    findings[2]?.kind !== 'container' ||
    findings[3]?.action !== '*mutable-action-alias' ||
    findings[3]?.kind !== 'dynamic' ||
    findings[4]?.action !== '${{' ||
    findings[4]?.kind !== 'dynamic'
  ) {
    throw new Error(`self-test failed: ${JSON.stringify(findings)}`);
  }

  console.log('GitHub Actions pinning self-test: PASS');
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest();
    return;
  }

  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const repositoryRoot = resolve(scriptDirectory, '..');
  const githubRoot = join(repositoryRoot, '.github');
  const files = yamlFiles(githubRoot);
  const findings = files.flatMap((filename) =>
    findUnpinnedActions(readFileSync(filename, 'utf8'), relative(repositoryRoot, filename)),
  );

  const allowTemporaryExceptions = process.argv.includes('--allow-temporary-exceptions');
  const remainingExceptions = new Map(TEMPORARY_EXCEPTIONS);
  const blocked = [];
  const coordinated = [];

  for (const finding of findings) {
    const key = `${finding.filename}|${finding.action}|${finding.ref}`;
    const remaining = remainingExceptions.get(key) ?? 0;

    if (allowTemporaryExceptions && remaining > 0) {
      remainingExceptions.set(key, remaining - 1);
      coordinated.push(finding);
    } else {
      blocked.push(finding);
    }
  }

  if (allowTemporaryExceptions) {
    const staleExceptions = [...remainingExceptions.entries()].filter(([, count]) => count !== 0);

    if (staleExceptions.length > 0) {
      for (const [key, count] of staleExceptions) {
        console.error(`stale GitHub Actions coordination exception: ${key} (missing ${count})`);
      }
      console.error('Remove stale exceptions as soon as the corresponding workflow is pinned.');
      process.exitCode = 1;
      return;
    }
  }

  if (blocked.length > 0) {
    for (const finding of blocked) {
      if (finding.kind === 'container') {
        console.error(
          `${finding.filename}:${finding.line}: ${finding.action} is not pinned to a sha256 container digest`,
        );
      } else if (finding.kind === 'dynamic') {
        console.error(
          `${finding.filename}:${finding.line}: ${finding.action} is not a literal local action or immutable external action reference`,
        );
      } else {
        console.error(
          `${finding.filename}:${finding.line}: ${finding.action}@${finding.ref} is not pinned to a full commit SHA`,
        );
      }
    }

    console.error(`GitHub Actions pinning validation: FAIL (${blocked.length} mutable reference(s))`);
    process.exitCode = 1;
    return;
  }

  if (coordinated.length > 0) {
    console.warn(
      `GitHub Actions pinning coordination: ${coordinated.length} exact mutable reference(s) remain temporarily isolated`,
    );
  }
  console.log(
    `GitHub Actions pinning validation: PASS (${files.length} GitHub YAML files, ${coordinated.length} temporary exception(s))`,
  );
}

main();
