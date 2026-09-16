/*
 * Les trois listes, composées de ce que nos clés savent réellement joindre.
 *
 * Chaque entrée a été vérifiée le 2026-09-16 par un appel réel ou par
 * `GET /v1/models/{id}`, avec un identifiant bidon en contrôle négatif. Les
 * tarifs viennent des grilles publiques des fournisseurs, relevées le même jour.
 *
 * Ce que la mesure a écarté :
 *   `claude-opus-5-fast`  404 not_found_error  → mode de service, pas un modèle
 *   `gpt-5.6-luna-fast`   404 model_not_found  → idem
 *
 * Ce que la mesure a confirmé et que le code ignorait :
 *   claude-sonnet-5, claude-fable-5-1, gpt-5.6-terra, gpt-5.6-luna,
 *   gpt-6-astra, kimi-k3 — tous ouverts sur nos comptes.
 */
import type { CatalogueDuMode } from './catalogue-de-modeles.js';

/*
 * LITE — multiplicateur ×0,5, prix utilisateur 325 / 1625.
 * Aucun modèle au-dessus de ce prix n'a le droit d'y figurer.
 */
const LITE: CatalogueDuMode = {
  mode: 'lite',
  automatique: { politique: 'moins-cher' },
  modeles: [
    {
      model: 'gpt-5.6-luna',
      provider: 'openai',
      costInCentsPerM: 20,
      costOutCentsPerM: 120,
      repli: { model: 'gemini-2.5-pro' },
    },
    {
      model: 'claude-haiku-4-5',
      provider: 'anthropic',
      costInCentsPerM: 100,
      costOutCentsPerM: 500,
      repli: { model: 'gpt-5.6-luna' },
    },
    {
      model: 'gemini-2.5-pro',
      provider: 'google',
      costInCentsPerM: 125,
      costOutCentsPerM: 1000,
      repli: { model: 'gpt-5.6-luna' },
    },
  ],
};

/*
 * POWER — multiplicateur ×1, prix utilisateur 650 / 3250. Le mode par défaut.
 */
const POWER: CatalogueDuMode = {
  mode: 'power',
  automatique: { politique: 'moins-cher' },
  modeles: [
    {
      model: 'gpt-5.6-luna',
      provider: 'openai',
      costInCentsPerM: 40,
      costOutCentsPerM: 240,
      serviceTier: 'fast',
      repli: { model: 'claude-sonnet-5' },
    },
    {
      model: 'claude-sonnet-5',
      provider: 'anthropic',
      costInCentsPerM: 200,
      costOutCentsPerM: 1000,
      repli: { model: 'gpt-5.6-terra' },
    },
    {
      model: 'gpt-5.6-terra',
      provider: 'openai',
      costInCentsPerM: 200,
      costOutCentsPerM: 1200,
      repli: { model: 'claude-sonnet-5' },
    },
    {
      model: 'claude-sonnet-4-6',
      provider: 'anthropic',
      costInCentsPerM: 300,
      costOutCentsPerM: 1500,
      repli: { model: 'gpt-5.6-terra' },
    },
  ],
};

/*
 * MAX — multiplicateur ×2, prix utilisateur 1300 / 6500.
 *
 * C'est le SEUL mode où les trois modèles à 1000 / 5000 dégagent une marge :
 * 23 % au ×2, contre −54 % au ×1. Les descendre d'un cran reviendrait à vendre
 * à perte — c'est la raison d'être de `catalogue-de-modeles.spec.ts`.
 */
const MAX: CatalogueDuMode = {
  mode: 'max',
  automatique: { politique: 'moins-cher' },
  modeles: [
    {
      model: 'kimi-k3',
      provider: 'moonshot',
      costInCentsPerM: 300,
      costOutCentsPerM: 1500,
      repli: { model: 'gpt-5.6-sol' },
    },
    {
      model: 'gpt-5.6-sol',
      provider: 'openai',
      costInCentsPerM: 400,
      costOutCentsPerM: 2000,
      repli: { model: 'claude-opus-5' },
    },
    {
      model: 'claude-opus-5',
      provider: 'anthropic',
      costInCentsPerM: 500,
      costOutCentsPerM: 2500,
      repli: { model: 'gpt-6-astra' },
    },
    {
      model: 'claude-fable-5-1',
      provider: 'anthropic',
      costInCentsPerM: 1000,
      costOutCentsPerM: 5000,

      /*
       * LA RÈGLE D'AVI, mot pour mot : « utilise le modèle Opus si le modèle
       * Fable n'est plus disponible ». Elle vise une panne PROPRE AU MODÈLE ;
       * elle ne protège pas d'un compte Anthropic à sec, qui couperait les deux
       * d'un coup. C'est assumé : la règle est celle qu'Avi a donnée.
       */
      repli: { model: 'claude-opus-5' },
    },
    {
      model: 'gpt-6-astra',
      provider: 'openai',
      costInCentsPerM: 1000,
      costOutCentsPerM: 5000,
      repli: { model: 'claude-opus-5' },
    },
    {
      model: 'claude-opus-5',
      provider: 'anthropic',
      costInCentsPerM: 1000,
      costOutCentsPerM: 5000,
      serviceTier: 'fast',

      /* Même modèle, vitesse standard : le plus proche en capacité qui existe. */
      repli: { model: 'claude-opus-5' },
    },
  ],
};

export const CATALOGUE_INTEGRE: CatalogueDuMode[] = [LITE, POWER, MAX];
