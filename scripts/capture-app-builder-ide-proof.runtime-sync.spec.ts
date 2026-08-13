import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

function sourceBetween(start: string, end: string) {
  return captureSource.slice(captureSource.indexOf(start), captureSource.indexOf(end));
}

describe('Solutions proof runtime reconciliation order', () => {
  const activityTrackerSource = sourceBetween('function isAgentChatRequest', '\nfunction previewSurfaceState');

  const operationsSource = sourceBetween(
    'function runtimeReconciliationOperations',
    '\nasync function waitForRuntimeFilesToMatchPersisted',
  );
  const syncSource = sourceBetween(
    'async function waitForRuntimeFilesToMatchPersisted',
    '\nasync function readRuntimePreviewPorts',
  );

  it('pins one workspace for the bounded reconciliation transaction', () => {
    const resolveIndex = syncSource.indexOf('const workspace = await resolveRuntimeWorkspace');
    const reconcileIndex = syncSource.indexOf('await reconcileRuntimeFileSnapshot');

    expect(resolveIndex).toBeGreaterThanOrEqual(0);
    expect(reconcileIndex).toBeGreaterThan(resolveIndex);
    expect(syncSource).toContain('runtimeReconciliationOperations(page, projectId, workspace.id, token)');
  });

  it('exposes exactly one restart operation and no restart after snapshot writes', () => {
    expect(operationsSource.match(/\/restart/g)).toHaveLength(1);

    const writeOperation = operationsSource.indexOf('writeSnapshot:');
    expect(writeOperation).toBeGreaterThanOrEqual(0);
    expect(operationsSource.slice(writeOperation)).not.toContain('/restart');
  });

  it('fences the complete chat stream and runtime mutations before reconciliation', () => {
    expect(activityTrackerSource).toContain("request.method() !== 'POST'");
    expect(activityTrackerSource).toContain('/^\\/api\\/chat\\/?$/');
    expect(activityTrackerSource).toContain('observeRuntimeWriteFence({');
    expect(activityTrackerSource).toContain('chatInflight: chatInflight.size');
    expect(activityTrackerSource).toContain('runtimeMutationInflight: state?.inflight.size ?? 0');
    expect(activityTrackerSource).toContain('lastChatActivityAtMs');
    expect(activityTrackerSource).toContain('state?.lastActivityAtMs');

    const registerIndex = captureSource.indexOf('registerRuntimeWriteActivityTracker(page)');
    const authenticateIndex = captureSource.indexOf('await authenticate(page');

    expect(registerIndex).toBeGreaterThanOrEqual(0);
    expect(registerIndex).toBeLessThan(authenticateIndex);
  });

  it('forwards persisted binary encoding during authoritative writes', () => {
    const writeSource = sourceBetween(
      'async function writePersistedSnapshotToRuntime',
      '\nfunction runtimeReconciliationOptions',
    );

    expect(writeSource).toContain('encoding: file.encoding');
  });

  it('runs a read-only stability gate before atomic public asset promotion', () => {
    const promotionIndex = captureSource.indexOf('const promotedAssets = await promoteVerifiedThemedAssets');
    const finalGateIndex = captureSource.lastIndexOf('await verifyRuntimeFilesBeforePromotion', promotionIndex);

    expect(finalGateIndex).toBeGreaterThanOrEqual(0);
    expect(finalGateIndex).toBeLessThan(promotionIndex);
  });
});
