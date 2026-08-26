import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PROVIDER_FALLBACK_CHAIN,
  PROVIDER_UNHEALTHY_TTL_MS,
  classifyProviderFailure,
  getProviderHealth,
  isProviderHealthy,
  isRetriableProviderFailure,
  markProviderHealthy,
  markProviderUnhealthy,
  resetProviderHealth,
  resetProviderProbeCache,
  resolveRuntimeProvider,
} from './provider-fallback';
import { PROVIDER_LIST } from '~/utils/constants';

/*
 * Mesuré en production le 19/08 depuis le pod `ai-gateway`, avec les clés déjà
 * en place dans `vibecore-platform-secrets` :
 *
 *   ANTHROPIC -> 400 {"error":{"message":"Your credit balance is too low…"}}
 *   OPENAI    -> 200  (gpt-4.1, gpt-4o)
 *   GEMINI    -> 200  (gemini-2.5-pro, gemini-2.5-flash)
 *
 * La génération rendait pourtant un 500 « Service indisponible », parce que le
 * seul repli existant (`resolveUsableProvider`) ne regarde que la PRÉSENCE de la
 * clé — et la clé Anthropic est présente.
 */

const anthropic = PROVIDER_LIST.find((p) => p.name === 'Anthropic')!;
const openai = PROVIDER_LIST.find((p) => p.name === 'OpenAI')!;
const google = PROVIDER_LIST.find((p) => p.name === 'Google')!;

const CLES = {
  Anthropic: 'sk-ant-test',
  OpenAI: 'sk-proj-test',
  Google: 'AIza-test',
};

beforeEach(() => {
  resetProviderHealth();
  resetProviderProbeCache();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('classification des échecs fournisseur', () => {
  it('reconnaît le solde Anthropic épuisé sur son 400, message à l’appui', () => {
    const erreur = Object.assign(new Error('AI_APICallError'), {
      statusCode: 400,
      responseBody: JSON.stringify({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Your credit balance is too low to access the Anthropic API.',
        },
      }),
    });

    expect(classifyProviderFailure(erreur)).toBe('credit');
    expect(isRetriableProviderFailure(erreur)).toBe(true);
  });

  it('reconnaît le quota OpenAI épuisé', () => {
    expect(classifyProviderFailure(Object.assign(new Error('insufficient_quota'), { statusCode: 429 }))).toBe('credit');
  });

  it.each([
    ['clé invalide', { statusCode: 401, message: 'invalid_api_key' }, 'auth'],
    ['limite de débit', { statusCode: 429, message: 'rate_limit_exceeded' }, 'rate-limit'],
    ['panne amont', { statusCode: 503, message: 'upstream unavailable' }, 'server'],
    ['réseau coupé', { message: 'fetch failed ECONNRESET' }, 'timeout'],
  ])('classe %s', (_libelle, forme, attendu) => {
    expect(classifyProviderFailure(Object.assign(new Error(String(forme.message)), forme))).toBe(attendu);
  });

  /*
   * Le point le plus important de cette classification : ne PAS basculer sur ce
   * qui échouerait pareil ailleurs. Épuiser la chaîne sur un prompt fautif
   * coûterait trois appels et masquerait la vraie cause à l'utilisateur.
   */
  it.each([
    ['un 400 ordinaire, sans mention de crédit', { statusCode: 400, message: 'messages.0.content: expected string' }],
    ['un outil inconnu', { statusCode: 400, message: 'unknown tool: foo' }],
    ['un 404 de modèle', { statusCode: 404, message: 'model not found' }],
  ])('ne bascule PAS sur %s', (_libelle, forme) => {
    expect(classifyProviderFailure(Object.assign(new Error(String(forme.message)), forme))).toBeNull();
  });

  it('ne bascule pas sur un abandon client — ce n’est pas une panne', () => {
    const abandon = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });

    expect(classifyProviderFailure(abandon)).toBeNull();
  });
});

describe('table de santé', () => {
  it('écarte puis relâche un fournisseur à l’expiration du TTL', () => {
    const t0 = 1_000_000;

    markProviderUnhealthy('Anthropic', 'credit', 'solde épuisé', t0);

    expect(isProviderHealthy('Anthropic', t0 + 1)).toBe(false);
    expect(getProviderHealth('Anthropic', t0 + 1)?.kind).toBe('credit');
    expect(isProviderHealthy('Anthropic', t0 + PROVIDER_UNHEALTHY_TTL_MS + 1)).toBe(true);
  });

  it('relâche immédiatement un fournisseur redevenu sain', () => {
    markProviderUnhealthy('Anthropic', 'credit', 'solde épuisé');
    markProviderHealthy('Anthropic');

    expect(isProviderHealthy('Anthropic')).toBe(true);
  });
});

describe('choix du fournisseur pour le tour', () => {
  it('ne touche à rien tant que le fournisseur demandé est sain', () => {
    const choix = resolveRuntimeProvider({
      provider: anthropic,
      model: 'claude-sonnet-4-5-20250929',
      apiKeys: CLES,
    });

    expect(choix.provider.name).toBe('Anthropic');
    expect(choix.model).toBe('claude-sonnet-4-5-20250929');
    expect(choix.switchedFrom).toBeUndefined();
  });

  it('bascule sur OpenAI quand Anthropic est à sec — le scénario mesuré', () => {
    markProviderUnhealthy('Anthropic', 'credit', 'Your credit balance is too low');

    const choix = resolveRuntimeProvider({
      provider: anthropic,
      model: 'claude-sonnet-4-5-20250929',
      apiKeys: CLES,
    });

    expect(choix.provider.name).toBe('OpenAI');
    expect(choix.model).toBe('gpt-4.1');
    expect(choix.switchedFrom).toEqual({
      provider: 'Anthropic',
      reason: 'credit',
      detail: 'Your credit balance is too low',
    });
  });

  it('descend jusqu’à Gemini quand Anthropic ET OpenAI sont tombés', () => {
    markProviderUnhealthy('Anthropic', 'credit', 'solde épuisé');
    markProviderUnhealthy('OpenAI', 'rate-limit', '429');

    const choix = resolveRuntimeProvider({ provider: anthropic, model: 'claude-sonnet-4-5-20250929', apiKeys: CLES });

    expect(choix.provider.name).toBe('Google');
    expect(choix.model).toBe('gemini-2.5-pro');
  });

  it('saute un fournisseur de repli dont la clé manque', () => {
    markProviderUnhealthy('Anthropic', 'credit', 'solde épuisé');

    /*
     * Le poste du développeur/runner peut porter une vraie clé gérée. Ce cas
     * teste explicitement son ABSENCE : neutraliser le process env empêche une
     * credential externe de rendre le test vert ou rouge selon la machine.
     */
    vi.stubEnv('OPENAI_API_KEY', '');

    const choix = resolveRuntimeProvider({
      provider: anthropic,
      model: 'claude-sonnet-4-5-20250929',
      apiKeys: { Anthropic: CLES.Anthropic, Google: CLES.Google },
      serverEnv: {},
    });

    expect(choix.provider.name).toBe('Google');
  });

  /*
   * Chaîne épuisée : on RETOURNE le fournisseur demandé plutôt que d'inventer
   * une erreur maison. C'est le message du fournisseur — « recharge ton crédit »
   * — qui dit à l'utilisateur quoi faire ; le masquer derrière une erreur de
   * repli lui retirerait la seule information actionnable.
   */
  it('conserve le fournisseur demandé quand toute la chaîne est indisponible', () => {
    markProviderUnhealthy('Anthropic', 'credit', 'solde épuisé');
    markProviderUnhealthy('OpenAI', 'auth', '401');
    markProviderUnhealthy('Google', 'server', '503');

    const choix = resolveRuntimeProvider({ provider: anthropic, model: 'claude-sonnet-4-5-20250929', apiKeys: CLES });

    expect(choix.provider.name).toBe('Anthropic');
    expect(choix.switchedFrom).toBeUndefined();
  });

  it('ne se choisit pas lui-même comme repli', () => {
    markProviderUnhealthy('OpenAI', 'rate-limit', '429');

    const choix = resolveRuntimeProvider({ provider: openai, model: 'gpt-4.1', apiKeys: CLES });

    expect(choix.provider.name).toBe('Google');
  });
});

describe('modèles de la chaîne', () => {
  /*
   * Un modèle de repli absent du registre échangerait une panne de crédit
   * contre une panne de modèle — c'est exactement ce qui est arrivé à
   * `gemini-2.0-flash`, que Google a retiré.
   */
  it('déclare des modèles qui existent réellement dans le registre de leur fournisseur', () => {
    for (const etape of PROVIDER_FALLBACK_CHAIN) {
      const fournisseur = PROVIDER_LIST.find((p) => p.name === etape.provider);

      expect(fournisseur, `fournisseur ${etape.provider} absent de PROVIDER_LIST`).toBeDefined();
      expect(
        fournisseur!.staticModels.some((m) => m.name === etape.model),
        `modèle ${etape.model} absent du registre ${etape.provider}`,
      ).toBe(true);
    }
  });

  it('classe OpenAI avant Google', () => {
    expect(PROVIDER_FALLBACK_CHAIN.map((e) => e.provider)).toEqual([openai.name, google.name]);
  });
});
