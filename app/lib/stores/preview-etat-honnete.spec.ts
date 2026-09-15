import { describe, expect, it } from 'vitest';
import { previewServerLooksRunning } from './preview-recovery';

/*
 * UN PORT NON VERIFIE NE VAUT PAS « RUNNING ».
 *
 * `ready !== false` est vrai quand `ready` vaut `undefined` — c'est-a-dire pour
 * un port simplement DETECTE, que personne n'a constate servir. Trois endroits
 * affichaient « running » sur cette base : `refreshRuntimePorts()` (appele par
 * six minuteries et a chaque ligne de sortie), le `finally` du flux de
 * commande, et le repli sans `package.json` — plus `devServerStatusText`, la
 * surface meme du libelle.
 *
 * Mesure du 2026-09-08 en production : aucun processus vite, rien en ecoute sur
 * 5173, et le bouton affichait « Stop running ». Un produit qui affirme un etat
 * qu'il n'a pas verifie empeche l'utilisateur de comprendre ce qui se passe.
 *
 * La moitie AGENT de ce defaut — le port fabrique — est tenue par
 * `services/workspace-agent/src/port-non-postule.spec.ts`.
 */

describe('un port non verifie ne vaut pas « running »', () => {
  it('ready undefined — detecte, jamais verifie — nest PAS running', () => {
    expect(previewServerLooksRunning([{ port: 5173 } as never])).toBe(false);
  });

  it('ready false non plus', () => {
    expect(previewServerLooksRunning([{ ready: false }])).toBe(false);
  });

  it('TEMOIN — un vrai oui reste un oui', () => {
    expect(previewServerLooksRunning([{ ready: true }])).toBe(true);
  });

  it('TEMOIN — serving true decide meme quand ready le nie (BUG-UX-DEV-BLOCKED-STUCK)', () => {
    /*
     * Cette moitie doit survivre : sans elle la barre retombe sur
     * « Dev: blocked » au-dessus d'une application qui sert reellement.
     */
    expect(previewServerLooksRunning([{ ready: false, serving: true }])).toBe(true);
  });

  it('aucun apercu du tout : pas running', () => {
    expect(previewServerLooksRunning([])).toBe(false);
  });
});
