import { describe, expect, it } from 'vitest';
import { detectPortsFromOutput } from './app.js';

/*
 * UN PORT SE CONSTATE, IL NE SE POSTULE PAS.
 *
 * `detectPortsFromOutput` ajoutait 5173 (3000 pour Next) des que la commande
 * ressemblait a un serveur de developpement, sans la moindre preuve qu'un
 * socket ecoute. Ce n'etait pas une detection degradee : c'etait une donnee
 * FABRIQUEE, et tout ce qui la lisait ensuite en heritait.
 *
 * `detectPorts()` ne retombe sur cette heuristique que lorsque /proc n'a rien
 * donne — c'est-a-dire exactement quand rien n'ecoute. Repondre « 5173 » a cet
 * instant precis est le contraire d'une detection.
 *
 * Mesure du 2026-09-08, production, workspace ws-4e6d3c6c540f6a8a : aucun
 * processus vite, rien en ecoute sur 5173, et l'interface affichait
 * « Stop running ». Le port fabrique satisfaisait aussi
 * `shouldUseExistingPreviewServer`, donc chaque demarrage suivant se
 * court-circuitait en « reattache » et NE RELANCAIT RIEN.
 */

const enregistrement = (command: string, output = '') =>
  new Map<string, never>([['cmd', { id: 'cmd', command, output, startedAt: '', process: {} } as never]]);

describe("l'agent ne postule aucun port", () => {
  it('ne rend rien pour une commande dev sans la moindre trace de port', () => {
    expect(detectPortsFromOutput(enregistrement('npm run dev', 'building...'))).toEqual([]);
  });

  it('ne rend rien non plus pour vite nu, ni pour next dev', () => {
    expect(detectPortsFromOutput(enregistrement('npx vite'))).toEqual([]);
    expect(detectPortsFromOutput(enregistrement('next dev'))).toEqual([]);
  });

  it('TEMOIN — un port REELLEMENT ecrit est toujours rendu', () => {
    /*
     * Contre-epreuve : le correctif ne doit pas aveugler la detection legitime.
     * Sans ce temoin, une fonction qui rendrait TOUJOURS [] passerait les deux
     * tests ci-dessus sans rien prouver.
     */
    expect(detectPortsFromOutput(enregistrement('npm run dev -- --port 5173')).map((p) => p.port)).toEqual([5173]);
    expect(
      detectPortsFromOutput(enregistrement('npm run dev', '  ➜  Local:   http://localhost:4321/\n')).map((p) => p.port),
    ).toEqual([4321]);
  });
});
