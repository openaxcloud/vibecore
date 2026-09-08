import { describe, expect, it } from 'vitest';
import { detectPortsFromOutput } from './app.js';

/*
 * UNE SUPPOSITION NE DOIT PAS SURVIVRE A LA FENETRE QU'ELLE COUVRE.
 *
 * `detectPortsFromOutput` attribue son port conventionnel a un serveur de
 * developpement quand sa sortie n'en donne encore aucun. L'intention est
 * legitime : entre l'instant ou la commande demarre et celui ou vite imprime
 * son URL, il n'y a rien a lire, et supposer 5173 permet d'afficher la page
 * « Starting your app… » au lieu d'un vide.
 *
 * CE QUI N'ETAIT PAS VOULU, c'est que la supposition dure indefiniment.
 * `detectPorts()` ne retombe sur cette heuristique que lorsque /proc n'a rien
 * donne — c'est-a-dire exactement quand rien n'ecoute. Passe le demarrage, elle
 * ne decrit plus un serveur qui arrive : elle decrit un serveur MORT, et elle
 * l'annonce vivant.
 *
 * Mesure du 2026-09-08, production, workspace ws-4e6d3c6c540f6a8a : aucun
 * processus vite, rien en ecoute sur 5173, et l'interface affichait
 * « Stop running ». Pire — ce port satisfaisait `shouldUseExistingPreviewServer`,
 * donc chaque demarrage suivant se court-circuitait en « reattache » et NE
 * RELANCAIT RIEN. C'est le verrou qui obligeait a lancer le serveur a la main.
 *
 * La moitie CLIENT de ce defaut — `ready !== false` qui lit `undefined` comme un
 * oui — est tenue par `app/lib/stores/preview-etat-honnete.spec.ts`.
 */

const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString();

const enregistrement = (command: string, output: string, ageMs: number) =>
  new Map<string, never>([['cmd', { id: 'cmd', command, output, startedAt: ilYA(ageMs), process: {} } as never]]);

describe('la supposition de port est bornee au demarrage', () => {
  it('PENDANT le demarrage, le port conventionnel est suppose — intention preservee', () => {
    expect(detectPortsFromOutput(enregistrement('npm run dev', '', 2_000)).map((p) => p.port)).toEqual([5173]);
    expect(detectPortsFromOutput(enregistrement('next dev', '', 2_000)).map((p) => p.port)).toEqual([3000]);
  });

  it("APRES le demarrage, sans aucune trace, plus rien n'est suppose — c'est le correctif", () => {
    expect(detectPortsFromOutput(enregistrement('npm run dev', 'building...', 5 * 60_000))).toEqual([]);
    expect(detectPortsFromOutput(enregistrement('npx vite', '', 5 * 60_000))).toEqual([]);
    expect(detectPortsFromOutput(enregistrement('next dev', '', 5 * 60_000))).toEqual([]);
  });

  it('TEMOIN — une trace REELLE est lue a tout age', () => {
    /*
     * Sans ce temoin, une fonction qui rendrait TOUJOURS [] passerait le test
     * precedent sans rien prouver. Il interdit un correctif qui aveuglerait la
     * detection legitime.
     */
    expect(
      detectPortsFromOutput(enregistrement('npm run dev -- --port 5173', '', 5 * 60_000)).map((p) => p.port),
    ).toEqual([5173]);
    expect(
      detectPortsFromOutput(enregistrement('npm run dev', '  ➜  Local:   http://localhost:4321/\n', 5 * 60_000)).map(
        (p) => p.port,
      ),
    ).toEqual([4321]);
  });
});
