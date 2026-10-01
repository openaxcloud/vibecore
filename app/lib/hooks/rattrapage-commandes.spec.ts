// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import type { Message } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';

/*
 * UNE COMMANDE COUPÉE N'EST PAS UNE COMMANDE — harnais repris de
 * rattrapage-fichiers.spec.ts.
 *
 * Le filet de fin de flux referme TOUTE action restée ouverte, commande
 * comprise, avec ce qu'il a reçu. Pour un fichier, la proposition est marquée
 * tronquée et le rattrapage la complète. Pour une commande, `onActionClose`
 * l'ajoutait et l'EXÉCUTAIT telle quelle : `npm run bu`. L'action était alors
 * « exécutée », et la vraie commande, rejouée par le rattrapage, sautée.
 *
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

let commandeLente: string | undefined;

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
  executeCommand: vi.fn(async (_runnerId: string, commande: string, _onAbort?: () => void) => {
    commandes.push(commande);

    if (commande === commandeLente) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

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

const REPONSE_COMPLETE = [
  'Je construis la page.',
  '<boltArtifact id="app" title="App">',
  '<boltAction type="file" filePath="src/a.ts">export const a = 1;</boltAction>',
  '<boltAction type="shell">npm install react react-dom</boltAction>',
  '<boltAction type="shell">npm run build</boltAction>',
  '</boltArtifact>',
  'Terminé.',
].join('\n');

const message = (id: string, content: string) => ({ id, role: 'assistant', content }) as Message;

async function vider() {
  for (let i = 0; i < 8; i++) {
    await file;

    for (const moteur of moteurs.values()) {
      await moteur.waitForIdle();
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Le tour jusqu'à `coupure`, puis ce que fait le chat sur une erreur réseau. */
async function tourCoupe(id: string, coupure: number, pendant?: () => Promise<void>) {
  const { result } = renderHook(() => useMessageParser());

  for (const fin of [Math.floor(coupure / 2), coupure]) {
    result.current.parseMessages([message(id, REPONSE_COMPLETE.slice(0, fin))], true);
  }

  if (pendant) {
    await pendant();
  } else {
    await vider();
  }

  workbenchStore.abortAllActions();
  result.current.parseMessages([message(id, REPONSE_COMPLETE.slice(0, coupure))], false);
  await vider();

  return result;
}

async function rattraper(result: Awaited<ReturnType<typeof tourCoupe>>, id: string) {
  workbenchStore.autoriserLaReprise(id);
  rejouerLeMessage(id, REPONSE_COMPLETE);
  result.current.parseMessages([message(id, REPONSE_COMPLETE)], false);
  await vider();
}

describe('rattrapage à la reprise — les commandes', () => {
  beforeEach(() => {
    ecritures.length = 0;
    commandes.length = 0;
    moteurs.clear();
    reprisesAutorisees.clear();
    commandeLente = undefined;
    file = Promise.resolve();
  });

  it('une commande COUPÉE en plein milieu ne s’exécute pas tronquée', async () => {
    await tourCoupe('coupee', REPONSE_COMPLETE.indexOf('npm run build') + 'npm run bu'.length);

    expect(commandes).toEqual(['npm install react react-dom']);
  });

  it('le rattrapage exécute la VRAIE commande, une seule fois, sans refaire ce qui était fait', async () => {
    const result = await tourCoupe('reprise', REPONSE_COMPLETE.indexOf('npm run build') + 'npm run bu'.length);

    await rattraper(result, 'reprise');

    expect(commandes).toEqual(['npm install react react-dom', 'npm run build']);
  });

  it('une commande COMPLÈTE, interrompue en cours d’exécution par la coupure, est relancée par le rattrapage', async () => {
    commandeLente = 'npm install react react-dom';

    /* La coupure tombe pendant que `npm install` tourne : sa balise est arrivée, pas la suite. */
    const coupure = REPONSE_COMPLETE.indexOf('<boltAction type="shell">npm run build');
    const result = await tourCoupe('installation', coupure, () => new Promise((resolve) => setTimeout(resolve, 50)));

    const moteur = [...moteurs.values()][0];

    const installation = Object.values(moteur.actions.get()).find(
      (a) => a.type === 'shell' && a.content.includes('npm install'),
    );

    expect(installation?.status).toBe('aborted');

    await rattraper(result, 'installation');

    expect(commandes.filter((c) => c === 'npm install react react-dom')).toHaveLength(2);
    expect(commandes.at(-1)).toBe('npm run build');
  });

  it('une commande quelconque, interrompue, n’est PAS relancée — un seed lancé deux fois ne s’annule pas', async () => {
    const seed = 'npx prisma db seed';
    commandeLente = seed;

    const avecSeed = REPONSE_COMPLETE.replace('npm install react react-dom', seed);
    const { result } = renderHook(() => useMessageParser());
    const coupure = avecSeed.indexOf('<boltAction type="shell">npm run build');

    result.current.parseMessages([message('seed', avecSeed.slice(0, coupure))], true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    workbenchStore.abortAllActions();
    result.current.parseMessages([message('seed', avecSeed.slice(0, coupure))], false);
    await vider();

    workbenchStore.autoriserLaReprise('seed');
    rejouerLeMessage('seed', avecSeed);
    result.current.parseMessages([message('seed', avecSeed)], false);
    await vider();

    expect(commandes.filter((c) => c === seed)).toHaveLength(1);
    expect(commandes.at(-1)).toBe('npm run build');
  });
});

describe('ce qui se rejoue sans risque après une coupure', () => {
  it.each([
    ['npm install', true],
    ['pnpm add react', true],
    ['yarn', false],
    ['npm install && npx prisma migrate dev', false],
    ['npx prisma db seed', false],
    ['rm -rf dist', false],
  ])('%j → %s', async (commande, attendu) => {
    const { seRejoueSansRisque } = await import('~/lib/runtime/action-runner');

    expect(seRejoueSansRisque({ type: 'shell', content: commande } as any)).toBe(attendu);
  });

  it('un fichier et le démarrage se rejouent', async () => {
    const { seRejoueSansRisque } = await import('~/lib/runtime/action-runner');

    expect(seRejoueSansRisque({ type: 'file', filePath: 'a', content: '' } as any)).toBe(true);
    expect(seRejoueSansRisque({ type: 'start', content: 'npm run dev' } as any)).toBe(true);
  });
});
