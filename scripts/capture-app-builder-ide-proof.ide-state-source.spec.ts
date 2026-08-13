import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const captureSource = readFileSync(resolve(process.cwd(), 'scripts/capture-app-builder-ide-proof.ts'), 'utf8');

describe('Solutions capture IDE-state wiring', () => {
  it('uses the bounded reader and passes reconciliation remaining budget', () => {
    expect(captureSource).toContain('return readProjectIdeStateWithRetry({');
    expect(captureSource).toContain('budgetMs,');
    expect(captureSource).toContain(
      'readSnapshot: (remainingBudgetMs) => readPersistedRuntimeSnapshot(page, projectId, token, remainingBudgetMs)',
    );
    expect(captureSource).toContain('Math.min(PROJECT_IDE_STATE_BUDGET_MS, remainingBudgetMs)');
  });

  it('keeps not-ready states pollable but rejects missing files in strict reconciliation', () => {
    expect(captureSource).toContain('const hasPackage = lastPaths.some');
    expect(captureSource).toContain('if (files.length === 0) {');
    expect(captureSource).toContain('The authoritative persisted project contains no files for runtime reconciliation');
  });

  it('does not retain the former undefined or catch-all reader path', () => {
    expect(captureSource).not.toContain('Promise<ProjectIdeState | undefined>');
    expect(captureSource).not.toContain('The authoritative persisted files are unavailable for runtime reconciliation');
  });
});
