import { describe, expect, it } from 'vitest';

import { PromptLibrary } from '../prompt-library';

/*
 * Avi : « tout doit être détaillé » — les messages de l'agent doivent dire ce
 * qu'il fait, sur quels fichiers, pourquoi, et le résultat.
 *
 * Le piège de ce point est de le corriger dans le MAUVAIS prompt : le dépôt en
 * contient trois (`default`, `original`, `optimized`), et seul `default` est
 * servi — il rend `getFineTunedPrompt` (`new-prompt.ts`), pas `prompts.ts`.
 * Ce test s'ancre sur le prompt REELLEMENT rendu par la bibliothèque, pas sur
 * un fichier choisi à la lecture.
 */
const options = {
  cwd: '/home/project',
  allowedHtmlElements: ['p', 'ul', 'li'],
  modificationTagName: 'diff',
  supabase: undefined,
  designScheme: undefined,
  includeDatabaseInstructions: false,
  includeMobileInstructions: false,
} as unknown as Parameters<typeof PromptLibrary.getPropmtFromLibrary>[1];

function promptServi(): string {
  return PromptLibrary.getPropmtFromLibrary('default', options);
}

describe('l’agent doit narrer son travail (demande d’Avi, point 4)', () => {
  it('le prompt SERVI est bien celui qu’on modifie', () => {
    const p = promptServi();

    expect(p.length, 'le prompt rendu est vide — la bibliothèque a changé').toBeGreaterThan(1000);
    expect(p).toContain('<response_requirements>');
  });

  it('les quatre éléments exigés sont présents', () => {
    const p = promptServi();

    expect(p, 'la consigne de narration a disparu').toContain('NARRATE THE WORK');

    // a. quoi — b. quels fichiers — c. pourquoi — d. le résultat
    expect(p).toMatch(/WHAT you are doing/);
    expect(p).toMatch(/WHICH FILES it touches/);
    expect(p).toMatch(/WHY/);
    expect(p).toMatch(/THE RESULT/);
  });

  it('un artefact seul, sans prose, est explicitement declare incomplet', () => {
    /*
     * C'est le coeur du point : aujourd'hui l'agent peut n'emettre qu'un
     * artefact, et l'utilisateur regarde des fichiers changer sans savoir ce
     * qui se passe.
     */
    expect(promptServi()).toMatch(/only an artifact, with no prose, is INCOMPLETE/);
  });

  it('la consigne borne aussi le bavardage, pour ne pas remplacer un defaut par l’autre', () => {
    expect(promptServi()).toMatch(/Do not pad/);
  });

  it('les trois exigences preexistantes sont conservees', () => {
    const p = promptServi();

    expect(p).toMatch(/professional, beautiful, unique/);
    expect(p).toMatch(/VALID markdown for all responses/);
    expect(p).toMatch(/without deviating into unrelated topics/);
  });
});
