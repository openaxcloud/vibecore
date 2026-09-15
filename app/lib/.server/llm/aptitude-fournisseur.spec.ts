import { describe, expect, it } from 'vitest';

import { decisionDeChaine, fournisseurInapte, type Maillon } from './aptitude-fournisseur';

const CHAINE: readonly Maillon[] = [
  { provider: 'Anthropic', model: 'claude-opus-5' },
  { provider: 'OpenAI', model: 'gpt-4.1' },
  { provider: 'Google', model: 'gemini-2.5-pro' },
];

describe('la capacité se mesure sur le résultat', () => {
  it('LIMITE 1 — une seule génération à zéro fichier établit l’inaptitude', () => {
    /*
     * On ne peut pas le savoir d'avance : le tour est perdu, et c'est le prix
     * assumé. Ce que la garde achète, c'est que le tour SUIVANT ne le répète pas.
     */
    expect(fournisseurInapte({ modeConstruction: true, fichiersEcrits: 0, termine: true })).toBe(true);
  });

  it('LIMITE 2 — une question sans fichier ne déclare personne inapte', () => {
    /*
     * « Explique-moi ce fichier » n'écrit rien, et c'est la bonne réponse.
     * Sans cette limite, le fournisseur le plus utile serait le premier écarté.
     */
    expect(fournisseurInapte({ modeConstruction: false, fichiersEcrits: 0, termine: true })).toBe(false);
  });

  it('un flux COUPÉ n’établit rien — il n’a pas eu l’occasion de finir', () => {
    expect(fournisseurInapte({ modeConstruction: true, fichiersEcrits: 0, termine: false })).toBe(false);
  });

  it('un tour qui écrit des fichiers laisse le fournisseur en place', () => {
    expect(fournisseurInapte({ modeConstruction: true, fichiersEcrits: 1, termine: true })).toBe(false);
    expect(
      decisionDeChaine({ modeConstruction: true, fichiersEcrits: 20, termine: true }, CHAINE, 'OpenAI', new Set()),
    ).toEqual({ action: 'garder' });
  });

  it('la chaîne AVANCE au maillon suivant, jamais en arrière', () => {
    const decision = decisionDeChaine(
      { modeConstruction: true, fichiersEcrits: 0, termine: true },
      CHAINE,
      'OpenAI',
      new Set(),
    );

    expect(decision).toEqual({ action: 'avancer', maillon: { provider: 'Google', model: 'gemini-2.5-pro' } });
  });

  it('un maillon déjà jugé inapte est sauté — sinon la chaîne boucle sur le premier vide', () => {
    const decision = decisionDeChaine(
      { modeConstruction: true, fichiersEcrits: 0, termine: true },
      CHAINE,
      'Anthropic',
      new Set(['OpenAI']),
    );

    expect(decision).toEqual({ action: 'avancer', maillon: { provider: 'Google', model: 'gemini-2.5-pro' } });
  });

  it('LIMITE 3 — si aucun maillon ne convient, ÉCHEC FRANC', () => {
    /*
     * Préférable à une application vide : c'est le défaut que ce module existe
     * pour supprimer, et le taire au dernier maillon le réintroduirait.
     */
    const decision = decisionDeChaine(
      { modeConstruction: true, fichiersEcrits: 0, termine: true },
      CHAINE,
      'Google',
      new Set(['Anthropic', 'OpenAI']),
    );

    expect(decision).toEqual({ action: 'echouer', raison: 'aucun-maillon-apte' });
  });

  it('TÉMOIN — la décision dépend vraiment du constat, pas d’un chemin unique', () => {
    /*
     * Sans ce témoin, une fonction qui rendrait TOUJOURS `garder` passerait la
     * moitié des tests ci-dessus, et une qui rendrait toujours `echouer` l'autre.
     */
    const actions = new Set(
      [
        decisionDeChaine({ modeConstruction: true, fichiersEcrits: 3, termine: true }, CHAINE, 'OpenAI', new Set()),
        decisionDeChaine({ modeConstruction: true, fichiersEcrits: 0, termine: true }, CHAINE, 'OpenAI', new Set()),
        decisionDeChaine({ modeConstruction: true, fichiersEcrits: 0, termine: true }, CHAINE, 'Google', new Set()),
      ].map((decision) => decision.action),
    );

    expect(actions).toEqual(new Set(['garder', 'avancer', 'echouer']));
  });
});
