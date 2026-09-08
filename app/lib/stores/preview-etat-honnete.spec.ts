import { describe, expect, it } from 'vitest';
import { detectPortsFromOutput } from '../../../services/workspace-agent/src/app';
import { previewServerLooksRunning } from './preview-recovery';

/*
 * LE PRODUIT NE DOIT PAS AFFIRMER UN ETAT QU'IL N'A PAS VERIFIE.
 *
 * Mesure du 2026-09-08, production, workspace ws-4e6d3c6c540f6a8a : aucun
 * processus vite, rien en ecoute sur 5173, et l'interface affichait
 * « Stop running ». Deux mecanismes s'ajoutaient — l'agent INVENTAIT le port
 * 5173, et le client lisait `ready !== false` comme un oui.
 *
 * Ces deux tests tiennent les deux moities. Retirer l'un ou l'autre correctif
 * doit faire rougir ce fichier.
 */

const enregistrement = (command: string, output = '') =>
  new Map<string, never>([['cmd', { id: 'cmd', command, output, startedAt: '', process: {} } as never]]);

describe("l'agent ne postule aucun port", () => {
  it('ne rend RIEN pour une commande dev sans la moindre trace de port', () => {
    // Le cas de production : /proc n'a rien donne parce que rien n'ecoutait.
    expect(detectPortsFromOutput(enregistrement('npm run dev', 'building...'))).toEqual([]);
  });

  it("ne rend rien non plus pour `vite` nu, ni pour `next dev`", () => {
    expect(detectPortsFromOutput(enregistrement('npx vite'))).toEqual([]);
    expect(detectPortsFromOutput(enregistrement('next dev'))).toEqual([]);
  });

  it('TEMOIN — un port REELLEMENT ecrit est toujours rendu', () => {
    // Contre-epreuve : le correctif ne doit pas aveugler la detection legitime.
    expect(detectPortsFromOutput(enregistrement('npm run dev -- --port 5173')).map((p) => p.port)).toEqual([5173]);
    expect(
      detectPortsFromOutput(enregistrement('npm run dev', '  ➜  Local:   http://localhost:4321/\n')).map((p) => p.port),
    ).toEqual([4321]);
  });
});

describe('un port non verifie ne vaut pas « running »', () => {
  it("`ready: undefined` — detecte, jamais verifie — n'est PAS running", () => {
    expect(previewServerLooksRunning([{ port: 5173 } as never])).toBe(false);
  });

  it('`ready: false` non plus', () => {
    expect(previewServerLooksRunning([{ ready: false }])).toBe(false);
  });

  it('TEMOIN — un vrai oui reste un oui', () => {
    expect(previewServerLooksRunning([{ ready: true }])).toBe(true);
  });

  it('TEMOIN — `serving: true` decide meme quand `ready` le nie (BUG-UX-DEV-BLOCKED-STUCK)', () => {
    // Cette moitie doit survivre : sans elle la barre retombe sur « Dev: blocked »
    // au-dessus d'une application qui sert reellement.
    expect(previewServerLooksRunning([{ ready: false, serving: true }])).toBe(true);
  });

  it('aucun apercu du tout : pas running', () => {
    expect(previewServerLooksRunning([])).toBe(false);
  });
});
