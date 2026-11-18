import { describe, expect, it } from 'vitest';
import { publicationSaveTarget } from './publication-save-target';

const form = (fields: Record<string, string>) => {
  const data = new FormData();

  for (const [key, value] of Object.entries(fields)) {
    data.set(key, value);
  }

  return data;
};

describe('publication save target', () => {
  it('uses the new publication form target', () => {
    expect(publicationSaveTarget('deployments', form({ workspaceId: 'workspace-a' }))).toBe('workspace-a');
  });
  it('uses the persisted redeployment source, never a supplied override', () => {
    expect(
      publicationSaveTarget('deployments', form({ intent: 'redeploy', deploymentId: 'dep', workspaceId: 'wrong' }), [
        { id: 'dep', provider: 'static', workspaceId: 'workspace-a' },
      ]),
    ).toBe('workspace-a');
  });
  it('rejects a new publication without a target', () => {
    expect(() => publicationSaveTarget('deployments', form({}))).toThrow('PUBLICATION_SAVE_WORKSPACE_CHANGED');
  });
  it('rejects an unknown redeployment source', () => {
    expect(() =>
      publicationSaveTarget('deployments', form({ intent: 'redeploy', deploymentId: 'unknown' }), []),
    ).toThrow('PUBLICATION_SAVE_SOURCE_MISSING');
  });
  it.each([undefined, null, '', '   '])(
    'does not infer a legacy workspace from the active or primary target (%s)',
    (workspaceId) => {
      expect(() =>
        publicationSaveTarget('deployments', form({ intent: 'redeploy', deploymentId: 'dep', workspaceId: 'active' }), [
          { id: 'dep', provider: 'static', workspaceId },
        ]),
      ).toThrow('PUBLICATION_SAVE_LEGACY_TARGET');
    },
  );
  it.each(['cancel', 'rollback'])('leaves %s unchanged', (intent) => {
    expect(publicationSaveTarget('deployments', form({ intent }))).toBeNull();
  });
  it('leaves repository publications and provider hooks unchanged', () => {
    expect(publicationSaveTarget('deployments', form({ provider: 'vercel' }))).toBeNull();
    expect(publicationSaveTarget('deployments', form({ repositoryUrl: 'https://example.invalid/repo' }))).toBeNull();
    expect(
      publicationSaveTarget('deployments', form({ intent: 'redeploy', deploymentId: 'dep' }), [
        { id: 'dep', provider: 'vercel' },
      ]),
    ).toBeNull();
    expect(publicationSaveTarget('git', form({}))).toBeNull();
  });
});
