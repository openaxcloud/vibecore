import { describe, expect, it } from 'vitest';

import { consommerPrompt, extractGenerationPrompt, promptRecuperable } from './pending-generation';

/**
 * LE PROMPT D'UN UTILISATEUR NE DOIT JAMAIS DISPARAÎTRE SANS TRACE.
 *
 * Mesuré en production le 2026-09-06 : sur 234 projets créés depuis un prompt,
 * 22 sont échoués — aucune application produite. Sur ces 22, il était impossible
 * de distinguer « le prompt n'a jamais été écrit » de « il a été effacé » :
 * 7 portaient `null`, 3 n'avaient pas la clé, et les deux effaceurs écrivaient
 * `null` en silence. Ce trou de diagnostic a coûté une enquête entière.
 */

const PROMPT = {
  id: 'p1',
  prompt: 'Créez un pitch deck de dix pages',
  model: 'claude-opus-5',
  provider: 'Anthropic',
  createdAt: '2026-09-06T05:31:13.000Z',
};

describe('A — le prompt est déplacé, jamais détruit', () => {
  it('conserve le prompt et dit QUI a effacé et QUAND', () => {
    const consomme = consommerPrompt(PROMPT, 'skipped-existing-app', () => '2026-09-06T05:33:44.000Z');

    expect(consomme.prompt).toBe(PROMPT.prompt);
    expect(consomme.reason).toBe('skipped-existing-app');
    expect(consomme.clearedAt).toBe('2026-09-06T05:33:44.000Z');
  });

  it('distingue les deux effaceurs — c’est tout l’intérêt du champ', () => {
    const a = consommerPrompt(PROMPT, 'generated', () => 'T');
    const b = consommerPrompt(PROMPT, 'skipped-existing-app', () => 'T');

    expect(a.reason).not.toBe(b.reason);
  });

  it('n’altère pas le prompt d’origine', () => {
    consommerPrompt(PROMPT, 'generated', () => 'T');
    expect(PROMPT).not.toHaveProperty('clearedAt');
  });
});

describe('B — le secours lit le vrai porteur, pas le README', () => {
  it('un prompt EN ATTENTE est récupérable', () => {
    expect(promptRecuperable({ pendingPrompt: PROMPT })).toBe(PROMPT.prompt);
  });

  it('un prompt CONSOMMÉ reste récupérable — les 12 projets encore réparables', () => {
    const consomme = consommerPrompt(PROMPT, 'generated', () => 'T');
    expect(promptRecuperable({ pendingPrompt: null, consumedPrompt: consomme })).toBe(PROMPT.prompt);
  });

  it('l’attente PRIME sur le consommé : la génération n’a pas encore eu lieu', () => {
    const consomme = consommerPrompt({ ...PROMPT, prompt: 'ancien' }, 'generated', () => 'T');
    expect(promptRecuperable({ pendingPrompt: PROMPT, consumedPrompt: consomme })).toBe(PROMPT.prompt);
  });

  it('rien à récupérer rend undefined, jamais une chaîne vide', () => {
    expect(promptRecuperable(undefined)).toBeUndefined();
    expect(promptRecuperable({ pendingPrompt: null, consumedPrompt: null })).toBeUndefined();
    expect(promptRecuperable({ pendingPrompt: { ...PROMPT, prompt: '   ' } })).toBeUndefined();
  });
});

describe('C — la récupération par README n’est plus anglophone', () => {
  const readme = (entete: string) => ({
    'README.md': { type: 'file' as const, content: `${entete}\n\nPrompt:\n\nCréez un pitch deck\n`, isBinary: false },
  });

  it('reconnaît un README FRANÇAIS — le cas d’Avi', () => {
    /*
     * L'ancien test cherchait la phrase anglaise « This project was created from
     * an AI prompt ». Sur une plateforme servie en français, le mécanisme de
     * secours était aveugle à ses propres utilisateurs.
     */
    const files = readme('# Mon projet\n\nCe projet a été créé à partir d’un prompt d’IA.');
    expect(extractGenerationPrompt(files)).toBe('Créez un pitch deck');
  });

  it('reconnaît toujours un README ANGLAIS — on n’a rien cassé en réparant', () => {
    const files = readme('# My project\n\nThis project was created from an AI prompt.');
    expect(extractGenerationPrompt(files)).toBe('Créez un pitch deck');
  });

  it('un README sans section Prompt ne rend rien — pas de faux positif', () => {
    const files = {
      'README.md': { type: 'file' as const, content: '# Mon projet\n\nCe projet a été créé.\n', isBinary: false },
    };
    expect(extractGenerationPrompt(files)).toBeUndefined();
  });
});
