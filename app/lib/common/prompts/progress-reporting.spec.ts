import { describe, expect, it } from 'vitest';

import { getFineTunedPrompt } from './new-prompt';
import optimizedPrompt from './optimized';
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
 *
 * ⚠️ Il ne regardait que `getSystemPrompt()`, c'est-à-dire la variante
 * `original` — que personne n'utilise : le `promptId` par défaut est `default`,
 * qui construit `getFineTunedPrompt`. La section vivait donc dans le dépôt et le
 * test était VERT, pendant que le prompt réellement envoyé n'en contenait rien.
 * C'est exactement le défaut décrit dans la demande : « le pourquoi manque ».
 *
 * La section a été déplacée dans le bloc partagé, et ce test porte désormais sur
 * les TROIS variantes actives.
 */

const PROMPTS: Array<[string, string]> = [
  ['original', getSystemPrompt()],
  ['default (fine-tuned)', getFineTunedPrompt()],
  [
    'optimized',
    optimizedPrompt({ cwd: '/home/project', allowedHtmlElements: ['a', 'p'], modificationTagName: 'bolt_file' }),
  ],
];

const PROMPT = getSystemPrompt();

describe('prompt système — compte rendu du travail', () => {
  it('contient une section dédiée au compte rendu, dans CHAQUE prompt actif', () => {
    for (const [name, prompt] of PROMPTS) {
      expect(prompt, `section absente du prompt ${name}`).toContain('<progress_reporting_instructions>');
      expect(prompt, `section non fermée dans le prompt ${name}`).toContain('</progress_reporting_instructions>');
    }
  });

  it('exige les QUATRE éléments : quoi, quels fichiers, pourquoi, résultat', () => {
    for (const [name, prompt] of PROMPTS) {
      const section = prompt
        .split('<progress_reporting_instructions>')[1]
        ?.split('</progress_reporting_instructions>')[0];

      expect(section, `section présente dans ${name}`).toBeTruthy();
      expect(section).toMatch(/\bWHAT\b/);
      expect(section).toMatch(/\bWHICH FILES\b/);
      expect(section).toMatch(/\bWHY\b/);
      expect(section).toMatch(/\bTHE RESULT\b/);
    }
  });

  it('exige de dire POURQUOI AINSI, pas seulement pourquoi', () => {
    /*
     * Le « pourquoi » que l'interface ne peut pas montrer n'est pas « ce
     * changement était nécessaire » — c'est le choix retenu contre l'autre
     * possible. Sans cette exigence, l'agent justifiait la tâche, pas la
     * décision.
     */
    for (const [name, prompt] of PROMPTS) {
      const section = prompt.split('<progress_reporting_instructions>')[1] ?? '';

      expect(section.replace(/\s+/g, ' '), `alternative non exigée dans ${name}`).toContain(
        'why THIS way rather than the obvious alternative',
      );
    }
  });

  it('exige de nommer la vérification derrière une réussite annoncée', () => {
    for (const [name, prompt] of PROMPTS) {
      const section = (prompt.split('<progress_reporting_instructions>')[1] ?? '').replace(/\s+/g, ' ');

      expect(section, `vérification non exigée dans ${name}`).toContain('Name the check behind any claim of success');
      expect(section).toContain('if you did not verify, say that instead');
    }
  });

  it('exige de répondre dans la langue de l’utilisateur', () => {
    for (const [name, prompt] of PROMPTS) {
      const section = (prompt.split('<progress_reporting_instructions>')[1] ?? '').replace(/\s+/g, ' ');

      expect(section, `langue non exigée dans ${name}`).toContain("ANSWER IN THE USER'S LANGUAGE");
    }
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
