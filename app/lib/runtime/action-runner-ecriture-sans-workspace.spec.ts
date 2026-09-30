import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionRunner } from './action-runner';
import { definirProjetCourant, ecrituresEnAttenteStore } from './ecritures-en-attente';
import type { ActionCallbackData } from './message-parser';

/*
 * BUG-QA0928-RUNTIME-ID-PROJET — le SITE D'APPEL de la file d'attente.
 *
 * Le module `ecritures-en-attente` sait garder et rejouer ; il ne protège de rien
 * si l'écriture de l'agent ne le lui confie pas. En production le 2026-09-28, 78
 * écritures ont été refusées et le contenu n'a été gardé nulle part.
 */

const refus = () =>
  Object.assign(new Error('Remote workspace has not been started'), { code: 'WORKSPACE_NOT_STARTED' });

function donnees(actionId: string, filePath: string, content: string): ActionCallbackData {
  return { artifactId: 'artifact-1', messageId: 'message-1', actionId, action: { type: 'file', filePath, content } };
}

function runtime(options: { dossier?: 'refuse' | 'ok'; ecriture?: 'refuse' | 'ok' | 'autre' }) {
  return {
    workdir: '/home/project',
    createDirectory: vi.fn(async () => {
      if (options.dossier === 'refuse') {
        throw refus();
      }
    }),
    writeFile: vi.fn(async () => {
      if (options.ecriture === 'refuse') {
        throw refus();
      }

      if (options.ecriture === 'autre') {
        throw Object.assign(new Error('Remote runtime request failed: 500'), { code: 'REMOTE_RUNTIME_REQUEST_FAILED' });
      }
    }),
    readFile: vi.fn(),
    listFiles: vi.fn(),
    runCommand: vi.fn(),
  } as unknown as RuntimeAdapter;
}

const shell = () => ({ ready: vi.fn(), terminal: {}, process: {}, executeCommand: vi.fn() }) as any;

async function executer(rt: RuntimeAdapter, data: ActionCallbackData) {
  const runner = new ActionRunner(rt, shell);
  runner.addAction(data);
  await runner.runAction(data, false);

  return runner.actions.get()[data.actionId] as { status?: string; error?: string } | undefined;
}

describe('une écriture refusée faute de workspace est gardée, et dite', () => {
  beforeEach(() => {
    definirProjetCourant('proj-qa');
  });

  it('refus à l’écriture : le contenu final est gardé et l’action le dit en clair', async () => {
    const action = await executer(runtime({ ecriture: 'refuse' }), donnees('a1', 'docs/NOTES.md', '# Notes\n'));

    expect(ecrituresEnAttenteStore.get().ecritures.map((e) => [e.chemin, e.contenu])).toEqual([
      ['docs/NOTES.md', '# Notes\n'],
    ]);
    expect(action?.status).toBe('failed');
    expect(action?.error).not.toMatch(/has not been started|WORKSPACE_NOT_STARTED/);
    expect(action?.error).toMatch(/workspace|espace de travail/i);
  });

  it('refus dès la création du dossier : le fichier est gardé quand même', async () => {
    await executer(runtime({ dossier: 'refuse', ecriture: 'refuse' }), donnees('a2', 'src/lib/util.md', 'u'));

    expect(ecrituresEnAttenteStore.get().ecritures.map((e) => e.chemin)).toEqual(['src/lib/util.md']);
  });

  it('une autre erreur n’entre PAS dans la file (elle échouerait pareil au rejeu)', async () => {
    await executer(runtime({ ecriture: 'autre' }), donnees('a3', 'README.md', 'x'));

    expect(ecrituresEnAttenteStore.get().ecritures).toEqual([]);
  });
});
