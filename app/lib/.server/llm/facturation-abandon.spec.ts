import { describe, expect, it } from 'vitest';
import { decisionDeFacturationSurAbandon, jetonsConnus } from './facturation-abandon';

/*
 * MESURÉ DANS LE CODE, pas déduit : `flushUsage` n'a que TROIS sites d'appel
 * (api.chat.ts 1779, 1816, 1839) et les trois sont dans le corps de `onFinish`.
 * Or `onError` porte cette note, écrite par la session qui l'a mesuré :
 *
 *     « SUR ABANDON, `onFinish` NE S'EXÉCUTE PAS — `onError` OUI. »
 *
 * Un tour arrêté par l'utilisateur ne passait donc jamais au registre. Et le
 * commentaire de `flushUsage` montre que la RÈGLE était déjà connue, apprise
 * deux fois : « Earlier this only fired on the non-'length' path, so tokens
 * burned on a capped or empty generation were never billed (quota leak). »
 * La sortie par abandon est la troisième occurrence du même mécanisme.
 */

const base = {
  dejaFacture: false,
  projectId: 'proj-1',
  usage: { promptTokens: 1200, completionTokens: 800, totalTokens: 2000 },
  abandonneParLeClient: true,
};

describe('decisionDeFacturationSurAbandon', () => {
  it('facture un tour abandonné dont les jetons sont connus, sous un motif distinct', () => {
    const d = decisionDeFacturationSurAbandon(base);

    expect(d.facturer).toBe(true);

    // Le motif doit rester SÉPARÉ : un exploitant doit pouvoir isoler les abandons.
    expect(d.finishReason).toBe('aborted');
  });

  it('ne facture JAMAIS deux fois : `onError` et `onFinish` peuvent tous deux s’exécuter', () => {
    const d = decisionDeFacturationSurAbandon({ ...base, dejaFacture: true });

    expect(d.facturer).toBe(false);
    expect(d.motif).toBe('deja-facture');
  });

  it('ne facture rien hors projet : le registre est par projet', () => {
    expect(decisionDeFacturationSurAbandon({ ...base, projectId: undefined }).motif).toBe('hors-projet');
  });

  it('ne facture rien quand aucun jeton n’est connu — on n’invente pas un montant', () => {
    const vide = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    expect(decisionDeFacturationSurAbandon({ ...base, usage: vide }).motif).toBe('aucun-jeton');
    expect(decisionDeFacturationSurAbandon({ ...base, usage: {} }).motif).toBe('aucun-jeton');
  });

  it('une panne AVANT toute génération n’est pas un abandon : rien n’a été produit', () => {
    const d = decisionDeFacturationSurAbandon({ ...base, abandonneParLeClient: false });

    expect(d.facturer).toBe(false);
    expect(d.motif).toBe('panne-avant-generation');
  });

  it('l’ordre des refus protège l’utilisateur avant l’exploitant', () => {
    /*
     * Un tour déjà facturé ET hors projet doit rendre « deja-facture ». La
     * double facturation coûte à l'UTILISATEUR ; la sous-facturation coûte à
     * l'exploitant. La garde la plus protectrice passe donc en premier.
     */
    const d = decisionDeFacturationSurAbandon({ ...base, dejaFacture: true, projectId: undefined });

    expect(d.motif).toBe('deja-facture');
  });
});

describe('jetonsConnus', () => {
  it('prend le total quand il est fourni, sinon la somme des deux moitiés', () => {
    expect(jetonsConnus({ totalTokens: 900 })).toBe(900);
    expect(jetonsConnus({ promptTokens: 400, completionTokens: 300 })).toBe(700);
  });

  it('ne se laisse pas minorer par un total incohérent plus petit que ses parties', () => {
    // Un fournisseur qui rend un total faux ne doit pas faire disparaître des jetons.
    expect(jetonsConnus({ promptTokens: 400, completionTokens: 300, totalTokens: 10 })).toBe(700);
  });

  it('rend zéro sur une entrée absente ou non numérique, jamais NaN', () => {
    expect(jetonsConnus({})).toBe(0);
    expect(jetonsConnus({ promptTokens: undefined, completionTokens: undefined })).toBe(0);
    expect(jetonsConnus({ totalTokens: Number.NaN })).toBe(0);
  });
});
