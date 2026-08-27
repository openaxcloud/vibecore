import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionRunner } from './action-runner';
import { actionRunnerEn, formatActionRunnerCopy, getActionRunnerCopy } from '~/lib/i18n/catalogs/action-runner';
import { getI18nInstance } from '~/lib/i18n/runtime';
import type { SupabaseAction } from '~/types/actions';

function createRunner(options: {
  onDeployAlert?: ReturnType<typeof vi.fn>;
  onSupabaseAlert?: ReturnType<typeof vi.fn>;
  readFile?: RuntimeAdapter['readFile'];
}) {
  const runtime = {
    workdir: '/workspace',
    readFile: options.readFile ?? vi.fn(),
  } as unknown as RuntimeAdapter;

  return new ActionRunner(runtime, () => ({}) as never, undefined, options.onSupabaseAlert, options.onDeployAlert);
}

afterEach(async () => {
  await getI18nInstance().changeLanguage('en');
});

describe('ActionRunner i18n', () => {
  it('uses the English catalogue as the fallback for unsupported locales', () => {
    const fallback = getActionRunnerCopy('de-DE');

    expect(fallback).toBe(actionRunnerEn);
    expect(
      formatActionRunnerCopy(fallback['actionRunner.shell.commandFailedTitle'], {
        exitCode: 127,
      }),
    ).toBe('Command Failed (exit code: 127)');
  });

  it('emits French deployment and Supabase alerts without changing technical content', async () => {
    await getI18nInstance().changeLanguage('fr');

    const onDeployAlert = vi.fn();
    const onSupabaseAlert = vi.fn();
    const runner = createRunner({ onDeployAlert, onSupabaseAlert });

    runner.handleDeployAction('deploying', 'running', { source: 'vercel' });
    await runner.handleSupabaseAction({
      type: 'supabase',
      operation: 'query',
      content: 'select count(*) from users;',
    } as SupabaseAction);

    expect(onDeployAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Déploiement de l’application',
        description: 'Déploiement de votre application…',
        source: 'vercel',
      }),
    );
    expect(onSupabaseAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Requête Supabase',
        description: 'Exécuter la requête de base de données',
        content: 'select count(*) from users;',
      }),
    );
  });

  it('localizes a diff failure while preserving the target path', async () => {
    await getI18nInstance().changeLanguage('fr');

    const runner = createRunner({
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    });
    const resolution = await runner.resolveDiffAction({
      filePath: 'src/Composant.tsx',
      content: '<<<<<<< SEARCH\nancien\n=======\nnouveau\n>>>>>>> REPLACE',
    });

    expect(resolution).toMatchObject({
      ok: false,
      kind: 'missing-file',
    });
    expect(resolution.ok ? '' : resolution.message).toBe(
      'La cible du diff src/Composant.tsx n’existe pas — le fichier complet est requis',
    );
  });
});
