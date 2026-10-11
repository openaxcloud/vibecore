// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

/*
 * LE SCÉNARIO COMPLET D'UNE COUPURE, AVEC LE VRAI PARSEUR ET LE VRAI MOTEUR.
 *
 * Seuls le disque (`writeFile`) et le terminal (`executeCommand`) sont des
 * doublures : ce sont les deux EFFETS DE BORD qu'on veut compter. Le parseur
 * (`useMessageParser`), le moteur (`ActionRunner`) et la règle de réarmement
 * (`actionApresReprise`) sont ceux du produit.
 *
 * Le workbench, lui, est réduit à son aiguillage : il crée un moteur par
 * artefact et appelle la MÊME fonction de décision que le vrai
 * (`actionApresReprise`). Que le vrai workbench l'appelle bien est tenu par
 * `rattrapage-cablage.spec.ts`.
 */

const ecritures: Array<{ chemin: string; contenu: string }> = [];
const commandes: string[] = [];

const runtime = {
  workdir: '/home/project',
  createDirectory: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn(async (chemin: string, contenu: string) => {
    ecritures.push({ chemin, contenu: String(contenu) });
  }),
  readFile: vi.fn(),
  listFiles: vi.fn(),
  runCommand: vi.fn(),
} as unknown as RuntimeAdapter;

const shell = {
  ready: vi.fn().mockResolvedValue(undefined),
  terminal: {},
  process: {},
  executeCommand: vi.fn(async (_runnerId: string, commande: string) => {
    commandes.push(commande);
    return { exitCode: 0, output: '' };
  }),
};

const moteurs = new Map<string, import('~/lib/runtime/action-runner').ActionRunner>();
const reprisesAutorisees = new Set<string>();

let file: Promise<unknown> = Promise.resolve();

vi.mock('~/lib/stores/workbench', async () => {
  const runtimeModule = await import('~/lib/runtime/action-runner');

  return {
    workbenchStore: {
      showWorkbench: { set: vi.fn() },
      files: { get: () => ({}) },
      addArtifact: (data: ArtifactCallbackData & { id: string }) => {
        if (!moteurs.has(data.id)) {
          moteurs.set(data.id, new runtimeModule.ActionRunner(runtime, () => shell as any));
        }
      },
      updateArtifact: vi.fn(),
      addAction: (data: ActionCallbackData) => moteurs.get(data.artifactId)!.addAction(data),
      runAction: (data: ActionCallbackData, isStreaming = false) => {
        const moteur = moteurs.get(data.artifactId)!;

        if (isStreaming) {
          return;
        }

        file = file.then(async () => {
          const action = runtimeModule.actionApresReprise(moteur, data, false, reprisesAutorisees.has(data.messageId));

          if (!action || action.executed) {
            return;
          }

          await moteur.runAction(data);
        });
      },
      abortAllActions: () => moteurs.forEach((moteur) => moteur.abortAll()),
      autoriserLaReprise: (messageId: string) => reprisesAutorisees.add(messageId),
    },
  };
});

/*
 * LE CHEMIN DE PRODUCTION. En développement, `parseMessages` remet TOUT le
 * parseur à zéro à chaque passage hors flux (`import.meta.env.DEV`) — ce qui
 * rejoue chaque message depuis le début et masquerait exactement le défaut
 * mesuré ici. Vitest tourne en DEV : on le coupe.
 */
vi.stubEnv('DEV', false);

const { useMessageParser, rejouerLeMessage } = await import('./useMessageParser');
const { workbenchStore } = (await import('~/lib/stores/workbench')) as any;

const CORPS_B = Array.from({ length: 40 }, (_, i) => `export const ligne${i} = ${i};`).join('\n');

const REPONSE_COMPLETE = [
  'Je construis la page.',
  '<boltArtifact id="app" title="App">',
  '<boltAction type="file" filePath="src/a.ts">export const a = 1;</boltAction>',
  '<boltAction type="shell">npm install</boltAction>',
  `<boltAction type="file" filePath="src/b.ts">${CORPS_B}</boltAction>`,
  '<boltAction type="file" filePath="src/c.ts">export const c = 3;</boltAction>',
  '<boltAction type="shell">npm run build</boltAction>',
  '</boltArtifact>',
  'Terminé.',
].join('\n');

/* La connexion tombe au milieu de src/b.ts. */
const COUPURE = REPONSE_COMPLETE.indexOf('ligne20');
const REPONSE_COUPEE = REPONSE_COMPLETE.slice(0, COUPURE);

const message = (id: string, content: string) => ({ id, role: 'assistant', content }) as Message;

async function vider() {
  for (let i = 0; i < 5; i++) {
    await file;

    for (const moteur of moteurs.values()) {
      await moteur.waitForIdle();
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

const ecrituresDe = (suffixe: string) => ecritures.filter((e) => e.chemin.endsWith(suffixe));

/** Le tour jusqu'à la coupure, puis ce que fait le chat sur une erreur réseau. */
async function tourCoupe(id: string) {
  const { result } = renderHook(() => useMessageParser());

  /* Le flux arrive en trois morceaux, comme un vrai flux. */
  for (const fin of [Math.floor(COUPURE / 3), Math.floor((2 * COUPURE) / 3), COUPURE]) {
    result.current.parseMessages([message(id, REPONSE_COMPLETE.slice(0, fin))], true);
  }

  await vider();

  /* `onError` : tout ce qui tourne est annulé, puis le filet de fin de flux ferme l'artefact. */
  workbenchStore.abortAllActions();
  result.current.parseMessages([message(id, REPONSE_COUPEE)], false);
  await vider();

  return result;
}

describe('rattrapage à la reprise — les fichiers', () => {
  beforeEach(() => {
    ecritures.length = 0;
    commandes.length = 0;
    moteurs.clear();
    reprisesAutorisees.clear();
    file = Promise.resolve();
  });

  it('LE CONSTAT : après la coupure, src/b.ts est « exécuté » sans avoir été écrit, et la suite manque', async () => {
    await tourCoupe('constat');

    const moteur = [...moteurs.values()][0];
    const b = Object.values(moteur.actions.get()).find((a) => a.type === 'file' && a.filePath === 'src/b.ts');

    expect(b?.executed).toBe(true);
    expect(b?.status).toBe('aborted');
    expect(ecrituresDe('src/b.ts')).toHaveLength(0);
    expect(ecrituresDe('src/c.ts')).toHaveLength(0);
    expect(commandes).toEqual(['npm install']);
  });

  it('la reprise écrit src/b.ts EN ENTIER et la suite, sans rien refaire de ce qui était fait', async () => {
    const result = await tourCoupe('reprise');

    workbenchStore.autoriserLaReprise('reprise');
    rejouerLeMessage('reprise', REPONSE_COMPLETE);
    result.current.parseMessages([message('reprise', REPONSE_COMPLETE)], false);
    await vider();

    /* Le fichier interrompu : écrit une fois, complet. */
    expect(ecrituresDe('src/b.ts')).toHaveLength(1);
    expect(ecrituresDe('src/b.ts')[0].contenu).toContain('ligne39 = 39');

    /* La suite : écrite et exécutée. */
    expect(ecrituresDe('src/c.ts')).toHaveLength(1);

    /* Les effets de bord déjà produits ne sont PAS rejoués. */
    expect(ecrituresDe('src/a.ts')).toHaveLength(1);
    expect(commandes).toEqual(['npm install', 'npm run build']);
  });

  it('contre-épreuve : sans autorisation de reprise, le fichier interrompu reste non écrit', async () => {
    const result = await tourCoupe('sans-autorisation');

    rejouerLeMessage('sans-autorisation', REPONSE_COMPLETE);
    result.current.parseMessages([message('sans-autorisation', REPONSE_COMPLETE)], false);
    await vider();

    expect(ecrituresDe('src/b.ts')).toHaveLength(0);
    expect(ecrituresDe('src/c.ts')).toHaveLength(1);
  });

  it('contre-épreuve : sans rejeu depuis le début, le fichier interrompu ne reçoit jamais sa fermeture', async () => {
    const result = await tourCoupe('sans-rejeu');

    workbenchStore.autoriserLaReprise('sans-rejeu');
    result.current.parseMessages([message('sans-rejeu', REPONSE_COMPLETE)], false);
    await vider();

    expect(ecrituresDe('src/b.ts').some((e) => e.contenu.includes('ligne39 = 39'))).toBe(false);
  });

  it("un rendu intermédiaire de l'ANCIENNE version ne déclenche pas le rejeu", async () => {
    const result = await tourCoupe('intermediaire');

    workbenchStore.autoriserLaReprise('intermediaire');
    rejouerLeMessage('intermediaire', REPONSE_COMPLETE);

    /* Un rendu arrive avant que le nouveau contenu soit posé. */
    result.current.parseMessages([message('intermediaire', REPONSE_COUPEE)], false);
    await vider();
    expect(ecrituresDe('src/b.ts')).toHaveLength(0);

    result.current.parseMessages([message('intermediaire', REPONSE_COMPLETE)], false);
    await vider();

    expect(ecrituresDe('src/b.ts')).toHaveLength(1);
    expect(ecrituresDe('src/b.ts')[0].contenu).toContain('ligne39 = 39');
  });
});
