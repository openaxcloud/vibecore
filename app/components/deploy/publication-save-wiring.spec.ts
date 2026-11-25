import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * The behavioral receipt/race tests run the actual WorkbenchStore. This guard
 * additionally ensures the managed UI continues to call that tested boundary.
 */
const source = readFileSync('app/components/chat/BaseChat.tsx', 'utf8');

const submit = source.slice(
  source.indexOf('  async function submit('),
  source.indexOf('  const data = payload?.data ?? {};'),
);

describe('managed publication save boundary wiring', () => {
  it('guards both new publication and the real Overview Republier path', () => {
    expect(submit).toContain("['default', 'redeploy'].includes(intent)");
    expect(submit).toContain('publicationSaveTarget(panel, formData, payload?.data?.deployments)');
    expect(submit).toContain('withSavedFilesForPublication(projectId, sendRequest, saveTarget)');
    expect(submit).toContain(': await sendRequest()');
    expect(source).toContain('onRepublier={republier}');
    expect(source).toContain("donnees.set('intent', 'redeploy')");
  });

  it('distinguishes save failure before POST from an HTTP action failure', () => {
    expect(submit).toMatch(/const sendRequest = \(\) => \{\s*savingForPublication = false;/u);
    expect(submit).toContain("t('baseChatAst.panel.publicationSaveFailed')");
    expect(submit).toContain("t('baseChatAst.panel.publicationLegacyTarget')");
    expect(submit).toContain(
      "requestError instanceof PublicationSaveError && requestError.code === 'PUBLICATION_SAVE_LEGACY_TARGET'",
    );
    expect(submit).not.toContain('requestError.message');
  });
});
