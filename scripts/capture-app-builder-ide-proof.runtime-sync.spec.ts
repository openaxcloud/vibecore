import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

function sourceBetween(start: string, end: string) {
  return captureSource.slice(captureSource.indexOf(start), captureSource.indexOf(end));
}

describe('Solutions proof runtime reconciliation order', () => {
  const syncSource = sourceBetween(
    'async function waitForRuntimeFilesToMatchPersisted',
    '\nasync function readRuntimePreviewPorts',
  );

  it('reapplies authoritative files after restart is running and verifies without another restart', () => {
    const authoritativeBranch = syncSource.slice(syncSource.indexOf('if (!reconciledAfterRestart)'));
    const restartIndex = authoritativeBranch.indexOf('const authoritativeRestartResponse');
    const runningIndex = authoritativeBranch.indexOf(".toBe('running')", restartIndex);

    const postRestartWriteIndex = authoritativeBranch.indexOf(
      'await writePersistedFilesToRuntime(page, projectId, workspace.id, token)',
      runningIndex,
    );
    const verificationIndex = authoritativeBranch.indexOf(
      'const reconciledAfterAuthoritativeWrite',
      postRestartWriteIndex,
    );

    expect(restartIndex).toBeGreaterThanOrEqual(0);
    expect(runningIndex).toBeGreaterThan(restartIndex);
    expect(postRestartWriteIndex).toBeGreaterThan(runningIndex);
    expect(verificationIndex).toBeGreaterThan(postRestartWriteIndex);

    const afterFinalWrite = authoritativeBranch.slice(postRestartWriteIndex);
    expect(afterFinalWrite).not.toContain('/restart');
  });

  it('forwards persisted binary encoding during authoritative writes', () => {
    const writeSource = sourceBetween(
      'async function writePersistedFilesToRuntime',
      '\nasync function waitForRuntimeFilesToMatchPersisted',
    );

    expect(writeSource).toContain("encoding?: 'utf8' | 'base64'");
    expect(writeSource).toContain('encoding: file.encoding');
  });
});
