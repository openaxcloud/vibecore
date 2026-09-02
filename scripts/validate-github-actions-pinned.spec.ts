import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyTemporaryExceptions,
  findUnpinnedActions,
  scanRepositoryForUnpinnedActions,
  validateTemporaryExceptions,
  type PinningFinding,
  type TemporaryException,
} from './validate-github-actions-pinned.js';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const DIGEST = 'a'.repeat(64);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

function repositoryFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'vibecore-actions-validator-'));
  temporaryDirectories.push(root);
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true });

  return root;
}

describe('GitHub Actions immutable identity validator', () => {
  it.each([
    'steps:\n  - uses : evil/action@main',
    'steps:\n  - "uses": evil/action@main',
    "steps:\n  - 'uses': evil/action@main",
    'steps:\n  - { uses: evil/action@main }',
    'steps:\n  - ? uses\n    : evil/action@main',
  ])('parses valid YAML spellings instead of scanning source text', (source) => {
    expect(findUnpinnedActions(source)).toEqual([
      expect.objectContaining({ action: 'evil/action', ref: 'main', kind: 'action' }),
    ]);
  });

  it.each([
    './actions/${{ matrix.path }}',
    `\${{ matrix.owner }}/repo@${SHA}`,
    `docker://\${{ matrix.image }}@sha256:${DIGEST}`,
    `nonsense@${SHA}`,
    '*action-alias',
  ])('rejects a dynamic or malformed identity: %s', (uses) => {
    const prefix = uses.startsWith('*') ? `action: &action-alias owner/repo@${SHA}\n` : '';
    const findings = findUnpinnedActions(`${prefix}steps:\n  - uses: "${uses}"`);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).not.toBe('action');
  });

  it('accepts only literal local paths, full action SHAs and full container digests', () => {
    const source = [
      'steps:',
      '  - uses: ./actions/build',
      `  - uses: actions/checkout@${SHA}`,
      `  - uses: docker://ghcr.io/owner/image:release@sha256:${DIGEST}`,
    ].join('\n');
    expect(findUnpinnedActions(source)).toEqual([]);
  });

  it('rejects a full SHA from an owner outside the reviewed trust policy', () => {
    expect(findUnpinnedActions(`steps:\n  - uses: unreviewed-owner/action@${SHA}`)).toEqual([
      expect.objectContaining({
        action: 'unreviewed-owner/action',
        ref: SHA,
        kind: 'trust',
      }),
    ]);
  });

  it('requires immutable digests for job and service containers only', () => {
    const source = [
      'jobs:',
      '  test:',
      '    container: node:22',
      '    services:',
      '      redis:',
      '        image: redis:7-alpine',
      '    steps:',
      '      - run: echo ok',
      '        with:',
      '          image: dynamic-build-output',
    ].join('\n');
    expect(findUnpinnedActions(source)).toEqual([
      expect.objectContaining({
        location: '$["jobs"]["test"]["container"]',
        action: 'node:22',
        kind: 'container',
      }),
      expect.objectContaining({
        location: '$["jobs"]["test"]["services"]["redis"]["image"]',
        action: 'redis:7-alpine',
        kind: 'container',
      }),
    ]);

    expect(
      findUnpinnedActions(
        `jobs:\n  test:\n    container:\n      image: ghcr.io/owner/node@sha256:${DIGEST}\n    services:\n      redis:\n        image: redis@sha256:${DIGEST}\n`,
      ),
    ).toEqual([]);
  });

  it('rejects duplicate uses keys and YAML merge keys fail-closed', () => {
    const duplicate = findUnpinnedActions('steps:\n  - { uses: owner/one@main, uses: owner/two@main }');
    expect(duplicate).toEqual([expect.objectContaining({ kind: 'yaml', ref: 'DUPLICATE_KEY' })]);

    const merged = findUnpinnedActions('base: &base { uses: owner/action@main }\nsteps:\n  - <<: *base');
    expect(merged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'owner/action', ref: 'main' }),
        expect.objectContaining({ kind: 'yaml', ref: 'yaml-merge-key' }),
      ]),
    );
  });

  it('binds an exception to one exact structural location', () => {
    const finding: PinningFinding = {
      filename: '.github/workflows/workflow.yml',
      line: 4,
      location: '$["jobs"]["build"]["steps"][0]["uses"]',
      action: 'owner/action',
      ref: 'main',
      kind: 'action',
      contextFingerprint: 'b'.repeat(64),
    };
    const exception: TemporaryException = {
      filename: finding.filename,
      location: finding.location,
      action: finding.action,
      ref: finding.ref,
      contextFingerprint: finding.contextFingerprint!,
      owner: 'test owner',
      ticket: 'https://github.com/openaxcloud/vibecore/pull/383',
      createdOn: '2026-01-01',
      expiresOn: '2026-01-30',
    };

    const activeDate = new Date('2026-01-15T00:00:00.000Z');

    expect(applyTemporaryExceptions([finding], [exception], activeDate)).toMatchObject({
      blocked: [],
      coordinated: [finding],
      stale: [],
      expired: [],
      inactive: [],
    });

    const moved = { ...finding, location: '$["jobs"]["release"]["steps"][0]["uses"]' };
    expect(applyTemporaryExceptions([moved], [exception], activeDate)).toMatchObject({
      blocked: [moved],
      coordinated: [],
      stale: [exception],
      inactive: [],
    });

    expect(applyTemporaryExceptions([finding, moved], [exception], activeDate)).toMatchObject({
      blocked: [moved],
      coordinated: [finding],
      stale: [],
      inactive: [],
    });
  });

  it('invalidates context changes and expired or malformed exceptions', () => {
    const finding: PinningFinding = {
      filename: '.github/workflows/example.yml',
      line: 4,
      location: '$["jobs"]["build"]["steps"][0]["uses"]',
      action: 'owner/action',
      ref: 'main',
      kind: 'action',
      contextFingerprint: 'b'.repeat(64),
    };
    const exception: TemporaryException = {
      filename: finding.filename,
      location: finding.location,
      action: finding.action,
      ref: finding.ref,
      contextFingerprint: finding.contextFingerprint!,
      owner: 'test owner',
      ticket: 'https://github.com/openaxcloud/vibecore/pull/383',
      createdOn: '2026-01-01',
      expiresOn: '2026-01-30',
    };

    const changed = { ...finding, contextFingerprint: 'c'.repeat(64) };
    expect(applyTemporaryExceptions([changed], [exception], new Date('2026-01-15T00:00:00.000Z'))).toMatchObject({
      blocked: [changed],
      stale: [exception],
      expired: [],
      inactive: [],
    });
    expect(applyTemporaryExceptions([finding], [exception], new Date('2026-02-01T00:00:00.000Z'))).toMatchObject({
      blocked: [finding],
      stale: [],
      expired: [exception],
      inactive: [],
    });

    const futureException = { ...exception, createdOn: '2026-01-16' };
    expect(applyTemporaryExceptions([finding], [futureException], new Date('2026-01-15T00:00:00.000Z'))).toMatchObject({
      blocked: [finding],
      coordinated: [],
      stale: [],
      expired: [],
      inactive: [futureException],
    });

    expect(
      validateTemporaryExceptions([{ ...exception, ticket: 'not-a-ticket', expiresOn: '2026-03-15' }]),
    ).toHaveLength(2);
    expect(validateTemporaryExceptions([{ ...exception, createdOn: '2026-02-31' }])).toEqual([
      expect.stringContaining('real calendar dates'),
    ]);
  });

  it('recursively scans reachable local actions outside .github', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, 'ci', 'composite'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./ci/composite\n',
    );
    writeFileSync(
      join(root, 'ci', 'composite', 'action.yml'),
      'runs:\n  using: composite\n  steps:\n    - uses: evil/action@main\n',
    );

    const result = scanRepositoryForUnpinnedActions(root);
    expect(result.scannedFiles).toEqual(['.github/workflows/ci.yml', 'ci/composite/action.yml']);
    expect(result.findings).toEqual([
      expect.objectContaining({
        filename: 'ci/composite/action.yml',
        action: 'evil/action',
        ref: 'main',
      }),
    ]);
  });

  it('pins remote images declared by local Docker actions', () => {
    const mutableRoot = repositoryFixture();
    mkdirSync(join(mutableRoot, 'actions', 'docker'), { recursive: true });
    writeFileSync(
      join(mutableRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./actions/docker\n',
    );
    writeFileSync(
      join(mutableRoot, 'actions', 'docker', 'action.yml'),
      'runs:\n  using: docker\n  image: docker://evil/image:latest\n',
    );
    expect(scanRepositoryForUnpinnedActions(mutableRoot).findings).toEqual([
      expect.objectContaining({
        filename: 'actions/docker/action.yml',
        location: '$["runs"]["image"]',
        action: 'docker://evil/image:latest',
        kind: 'container',
      }),
    ]);

    const immutableRoot = repositoryFixture();
    mkdirSync(join(immutableRoot, 'actions', 'docker'), { recursive: true });
    writeFileSync(
      join(immutableRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./actions/docker\n',
    );
    writeFileSync(
      join(immutableRoot, 'actions', 'docker', 'action.yml'),
      `runs:\n  using: docker\n  image: docker://evil/image@sha256:${DIGEST}\n`,
    );
    expect(scanRepositoryForUnpinnedActions(immutableRoot).findings).toEqual([]);

    const dockerfileRoot = repositoryFixture();
    mkdirSync(join(dockerfileRoot, 'actions', 'docker'), { recursive: true });
    writeFileSync(
      join(dockerfileRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./actions/docker\n',
    );
    writeFileSync(
      join(dockerfileRoot, 'actions', 'docker', 'action.yml'),
      'runs:\n  using: docker\n  image: Dockerfile\n',
    );
    expect(scanRepositoryForUnpinnedActions(dockerfileRoot).findings).toEqual([]);
  });

  it('rescans workflow-tree descriptors as local action metadata', () => {
    const root = repositoryFixture();
    mkdirSync(join(root, '.github', 'workflows', 'a-action'), { recursive: true });
    writeFileSync(
      join(root, '.github', 'workflows', 'a-action', 'action.yml'),
      'runs:\n  using: docker\n  image: docker://alpine:latest\n',
    );
    writeFileSync(
      join(root, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./.github/workflows/a-action\n',
    );

    const result = scanRepositoryForUnpinnedActions(root);

    expect(result.scannedFiles).toEqual(['.github/workflows/a-action/action.yml', '.github/workflows/ci.yml']);
    expect(result.findings).toEqual([
      expect.objectContaining({
        filename: '.github/workflows/a-action/action.yml',
        location: '$["runs"]["image"]',
        action: 'docker://alpine:latest',
        kind: 'container',
      }),
    ]);
  });

  it('rejects missing, symlinked and cyclic local actions', () => {
    const missingRoot = repositoryFixture();
    writeFileSync(
      join(missingRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./missing/action\n',
    );
    expect(scanRepositoryForUnpinnedActions(missingRoot).findings).toEqual([
      expect.objectContaining({ ref: 'unsafe-local-action', detail: expect.stringContaining('does not exist') }),
    ]);

    const symlinkRoot = repositoryFixture();
    mkdirSync(join(symlinkRoot, 'actions', 'real'), { recursive: true });
    writeFileSync(join(symlinkRoot, 'actions', 'real', 'action.yml'), 'runs:\n  using: composite\n  steps: []\n');
    symlinkSync(join(symlinkRoot, 'actions', 'real'), join(symlinkRoot, 'actions', 'linked'));
    writeFileSync(
      join(symlinkRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./actions/linked\n',
    );
    expect(scanRepositoryForUnpinnedActions(symlinkRoot).findings).toEqual([
      expect.objectContaining({ ref: 'unsafe-local-action', detail: expect.stringContaining('symbolic link') }),
    ]);

    const cycleRoot = repositoryFixture();

    for (const name of ['a', 'b']) {
      mkdirSync(join(cycleRoot, 'actions', name), { recursive: true });
    }
    writeFileSync(
      join(cycleRoot, '.github', 'workflows', 'ci.yml'),
      'jobs:\n  test:\n    steps:\n      - uses: ./actions/a\n',
    );
    writeFileSync(
      join(cycleRoot, 'actions', 'a', 'action.yml'),
      'runs:\n  using: composite\n  steps:\n    - uses: ./actions/b\n',
    );
    writeFileSync(
      join(cycleRoot, 'actions', 'b', 'action.yml'),
      'runs:\n  using: composite\n  steps:\n    - uses: ./actions/a\n',
    );
    expect(scanRepositoryForUnpinnedActions(cycleRoot).findings).toEqual([
      expect.objectContaining({ ref: 'unsafe-local-action', detail: expect.stringContaining('cycle') }),
    ]);
  });
});
