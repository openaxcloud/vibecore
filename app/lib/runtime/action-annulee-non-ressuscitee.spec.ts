import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { describe, expect, it, vi } from 'vitest';

import { ActionRunner } from './action-runner';
import type { ActionCallbackData } from './message-parser';

function donneesDeFichier(actionId: string, content: string): ActionCallbackData {
  return {
    artifactId: 'artifact-1',
    messageId: 'message-1',
    actionId,
    action: { type: 'file', filePath: 'src/App.tsx', content },
  };
}

function runtime() {
  return {
    workdir: '/home/project',
    createDirectory: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    listFiles: vi.fn(),
    runCommand: vi.fn(),
  } as unknown as RuntimeAdapter;
}

function shell() {
  return { ready: vi.fn().mockResolvedValue(undefined), terminal: {}, process: {}, executeCommand: vi.fn() };
}

/**
 * LE CHEMIN QUI RESSUSCITAIT UNE ACTION ANNULÉE.
 *
 * `workbenchStore.runAction(data, true)` passe par un `createSampler` de 100 ms
 * dont l'appel de QUEUE est armé par un `setTimeout` que RIEN n'annule. Un
 * Arrêt pendant qu'un fichier streame laisse donc partir un dernier appel
 * jusqu'à 100 ms APRÈS l'annulation. Il atteignait `#executeAction`, qui posait
 * « running » inconditionnellement, puis la mise à jour terminale reposait
 * encore « running » parce que le contrôle du signal n'existait que sur la
 * branche non-streamée.
 *
 * Rien ne le redescendait : le chien de garde sort d'emblée pour une action
 * `file` non exécutée, et `abortStreamingFileActions` n'est appelé que depuis
 * `onFinish`, qui ne s'exécute pas sur un abandon. Le fichier restait « En
 * cours » pour toujours après un Arrêt EXPLICITE de l'utilisateur.
 *
 * Le test rejoue exactement cet ordonnancement : le dernier appel streamé
 * arrive APRÈS `abortAll()`.
 */
describe('une action annulée ne repasse jamais « en cours »', () => {
  it("l'appel streamé en retard n'écrase pas le statut « aborted »", async () => {
    const runner = new ActionRunner(runtime(), () => shell() as any);
    const data = donneesDeFichier('action-stream', 'export function App() {');

    runner.addAction(data);
    await runner.runAction(data, true);

    runner.abortAll();
    expect(runner.actions.get()[data.actionId]?.status).toBe('aborted');

    /* L'appel de queue du lissage, en retard sur l'Arrêt. */
    await runner.runAction(donneesDeFichier('action-stream', 'export function App() { return null; }'), true);
    await runner.waitForIdle();
    await Promise.resolve();

    expect(runner.actions.get()[data.actionId]?.status).toBe('aborted');
  });

  it('le contrôle négatif : SANS Arrêt, le même enchaînement laisse bien « running »', async () => {
    /*
     * L'autre moitié de la contre-épreuve. Sans elle, un correctif qui poserait
     * « aborted » sur TOUT appel streamé passerait aussi le test ci-dessus —
     * en cassant le cas normal, où un fichier qui streame DOIT rester en cours.
     */
    const runner = new ActionRunner(runtime(), () => shell() as any);
    const data = donneesDeFichier('action-vivante', 'export function App() {');

    runner.addAction(data);
    await runner.runAction(data, true);
    await runner.runAction(donneesDeFichier('action-vivante', 'export function App() { return null; }'), true);
    await runner.waitForIdle();

    expect(runner.actions.get()[data.actionId]?.status).toBe('running');
  });

  it("une action annulée avant sa PREMIÈRE exécution n'est jamais passée à « running »", async () => {
    const runner = new ActionRunner(runtime(), () => shell() as any);
    const data = donneesDeFichier('action-jamais-lancee', 'export function App() {');

    runner.addAction(data);
    runner.abortAll();

    const vus: string[] = [];

    const arret = runner.actions.subscribe((actions) => {
      const statut = actions[data.actionId]?.status;

      if (statut) {
        vus.push(statut);
      }
    });

    await runner.runAction(data, true);
    await runner.waitForIdle();
    arret();

    expect(vus).not.toContain('running');
    expect(runner.actions.get()[data.actionId]?.status).toBe('aborted');
  });
});
