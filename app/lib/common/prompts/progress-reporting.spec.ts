import { describe, expect, it } from 'vitest';

import { getSystemPrompt } from './prompts';

/*
 * Demande d'Avi : les messages de l'agent doivent dire ce qu'il fait, sur quels
 * fichiers, POURQUOI, et le résultat.
 *
 * Le prompt demandait déjà un plan AVANT d'agir (`chain_of_thought`), mais rien
 * sur le compte rendu APRÈS. L'utilisateur voyait donc défiler des actions de
 * fichier sans savoir distinguer un renommage d'une réécriture, ni pourquoi la
 * modification avait lieu.
 *
 * Ce test fige les quatre exigences. Il ne vérifie pas une formulation : il
 * vérifie que chacune est bien demandée, pour qu'un remaniement du prompt ne
 * les laisse pas tomber en silence.
 */

const PROMPT = getSystemPrompt();

describe('prompt système — compte rendu du travail', () => {
  it('contient une section dédiée au compte rendu', () => {
    expect(PROMPT).toContain('<progress_reporting_instructions>');
    expect(PROMPT).toContain('</progress_reporting_instructions>');
  });

  it('exige les QUATRE éléments : quoi, quels fichiers, pourquoi, résultat', () => {
    const section = PROMPT.split('<progress_reporting_instructions>')[1]?.split(
      '</progress_reporting_instructions>',
    )[0];

    expect(section, 'section présente').toBeTruthy();
    expect(section).toMatch(/\bWHAT\b/);
    expect(section).toMatch(/\bWHICH FILES\b/);
    expect(section).toMatch(/\bWHY\b/);
    expect(section).toMatch(/\bTHE RESULT\b/);
  });

  it('interdit explicitement les désignations vagues de fichiers', () => {
    const section = PROMPT.split('<progress_reporting_instructions>')[1] ?? '';

    // « quelques fichiers » est précisément ce qui rend un compte rendu inutile.
    expect(section).toMatch(/some files/i);
    expect(section).toMatch(/name them explicitly/i);
  });

  it('exige que les échecs soient dits, pas seulement affichés en rouge', () => {
    const section = PROMPT.split('<progress_reporting_instructions>')[1] ?? '';

    expect(section).toMatch(/fails/i);
    expect(section).toMatch(/red action row/i);
  });

  it('demande de rester proportionné plutôt que bavard', () => {
    const section = PROMPT.split('<progress_reporting_instructions>')[1] ?? '';

    expect(section).toMatch(/proportionate/i);
    expect(section).toMatch(/Do not narrate trivial/i);
  });

  it('la section de plan AVANT action reste en place', () => {
    // Le compte rendu s'ajoute au plan, il ne le remplace pas.
    expect(PROMPT).toContain('<chain_of_thought_instructions>');
  });
});
