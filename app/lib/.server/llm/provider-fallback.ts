import { generateText } from 'ai';

import { isProviderUsable, type LLMProvider } from './provider-credentials';
import { LLMManager } from '~/lib/modules/llm/manager';
import { PROVIDER_LIST } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('provider-fallback');

/**
 * Pourquoi ce module existe, alors que `provider-credentials` fait déjà un
 * repli.
 *
 * `resolveUsableProvider` ne bascule que si la CLÉ EST ABSENTE. Or le mode de
 * panne mesuré en production le 19/08 est l'inverse : la clé Anthropic est bien
 * présente dans `vibecore-platform-secrets`, elle passe donc `isProviderUsable`
 * sans réserve — et c'est l'APPEL qui échoue, une fois la génération lancée :
 *
 *     400 {"type":"error","error":{"type":"invalid_request_error",
 *          "message":"Your credit balance is too low to access the Anthropic API…"}}
 *
 * L'utilisateur recevait alors un 500 « Service indisponible » sur une plateforme
 * dont DEUX autres fournisseurs étaient parfaitement fonctionnels : mesuré le
 * même jour depuis le pod `ai-gateway`, `gpt-4.1` et `gemini-2.5-pro` répondaient
 * `200` avec les clés déjà en place.
 *
 * D'où un repli à L'EXÉCUTION, et non à la configuration.
 */

export type ProviderFailureKind = 'credit' | 'auth' | 'rate-limit' | 'server' | 'timeout';

export type ProviderHealthEntry = Readonly<{
  kind: ProviderFailureKind;
  until: number;
  detail: string;
}>;

/**
 * Ordre de repli. Anthropic reste la tête de chaîne : c'est le fournisseur
 * choisi pour la qualité de génération, et le repli ne doit pas le déclasser
 * dès qu'il redevient payé.
 *
 * Les modèles de repli ne sont pas choisis au hasard : chacun a été appelé pour
 * de vrai le 19/08 avec la clé de production et a répondu `200`.
 * `gemini-2.0-flash` a été écarté — Google le retire (« no longer available »)
 * — au profit de `gemini-2.5-pro`, stable et non `preview`.
 */
export const PROVIDER_FALLBACK_CHAIN: readonly Readonly<{ provider: string; model: string }>[] = [
  { provider: 'OpenAI', model: 'gpt-4.1' },
  { provider: 'Google', model: 'gemini-2.5-pro' },
];

/**
 * Durée pendant laquelle un fournisseur reste écarté après un échec. Assez
 * longue pour qu'une rafale de tours ne re-tape pas un fournisseur à sec à
 * chaque message, assez courte pour qu'un rechargement de crédit soit repris
 * sans redéploiement.
 */
export const PROVIDER_UNHEALTHY_TTL_MS = 5 * 60 * 1000;

/**
 * Plafond de la sonde. Une sonde qui pend bloquerait la génération qu'elle est
 * censée protéger : au-delà de ce délai on abandonne la sonde et on laisse le
 * tour partir sur le fournisseur demandé, exactement comme avant ce module.
 * Un fournisseur sain répond à un jeton en quelques centaines de millisecondes.
 */
export const PROVIDER_PROBE_TIMEOUT_MS = 6_000;

const health = new Map<string, ProviderHealthEntry>();

/** Testable : remet la table de santé à zéro entre deux cas. */
export function resetProviderHealth(): void {
  health.clear();
}

export function markProviderUnhealthy(
  providerName: string,
  kind: ProviderFailureKind,
  detail: string,
  now: number = Date.now(),
  ttlMs: number = PROVIDER_UNHEALTHY_TTL_MS,
): void {
  health.set(providerName, { kind, until: now + ttlMs, detail });
  logger.warn(`Fournisseur [${providerName}] écarté ${Math.round(ttlMs / 1000)}s — ${kind} : ${detail}`);
}

export function markProviderHealthy(providerName: string): void {
  if (health.delete(providerName)) {
    logger.info(`Fournisseur [${providerName}] de nouveau disponible.`);
  }
}

export function getProviderHealth(providerName: string, now: number = Date.now()): ProviderHealthEntry | undefined {
  const entry = health.get(providerName);

  if (!entry) {
    return undefined;
  }

  if (entry.until <= now) {
    health.delete(providerName);
    return undefined;
  }

  return entry;
}

export function isProviderHealthy(providerName: string, now: number = Date.now()): boolean {
  return getProviderHealth(providerName, now) === undefined;
}

/*
 * Anthropic répond `400` — pas `402` — quand le solde est épuisé, et un 400 est
 * normalement une faute de l'appelant qu'un repli ne corrigerait pas. On ne
 * bascule donc sur un 400 QUE si le corps nomme explicitement le crédit, sinon
 * une requête réellement malformée irait épuiser toute la chaîne pour rien.
 */
const CREDIT_EXHAUSTED =
  /credit balance is too low|insufficient[_ ]quota|exceeded your current quota|billing[_ ]hard[_ ]limit|quota exceeded|resource[_ ]exhausted/i;

function textOf(error: unknown): string {
  if (!error) {
    return '';
  }

  if (typeof error === 'string') {
    return error;
  }

  const candidate = error as Record<string, unknown>;
  const parts = [candidate.message, candidate.responseBody, candidate.body, candidate.detail, candidate.error];

  return parts
    .map((part) => (typeof part === 'string' ? part : part ? JSON.stringify(part) : ''))
    .filter(Boolean)
    .join(' ');
}

function statusOf(error: unknown): number | undefined {
  const candidate = error as Record<string, unknown> | null;

  for (const key of ['statusCode', 'status', 'responseStatus'] as const) {
    const value = candidate?.[key];

    if (typeof value === 'number') {
      return value;
    }
  }

  return undefined;
}

/**
 * Classe un échec fournisseur, ou rend `null` quand rien ne justifie de changer
 * de fournisseur — une erreur de prompt, un outil inconnu ou un abandon client
 * échoueraient exactement pareil chez le suivant.
 */
export function classifyProviderFailure(error: unknown): ProviderFailureKind | null {
  if (!error) {
    return null;
  }

  const message = textOf(error);
  const status = statusOf(error);
  const name = typeof (error as { name?: unknown })?.name === 'string' ? (error as { name: string }).name : '';

  /* Un abandon volontaire n'est pas une panne : ne jamais relancer ailleurs. */
  if (name === 'AbortError' || /aborted|abortsignal/i.test(message)) {
    return null;
  }

  if (CREDIT_EXHAUSTED.test(message)) {
    return 'credit';
  }

  if (status === 401 || status === 403 || /invalid[_ ]api[_ ]key|unauthorized|permission denied/i.test(message)) {
    return 'auth';
  }

  if (status === 429 || /rate[_ ]limit|too many requests|overloaded/i.test(message)) {
    return 'rate-limit';
  }

  if (typeof status === 'number' && status >= 500) {
    return 'server';
  }

  if (
    name === 'TimeoutError' ||
    /etimedout|econnreset|econnrefused|enotfound|socket hang up|network error|fetch failed|timeout/i.test(message)
  ) {
    return 'timeout';
  }

  return null;
}

export function isRetriableProviderFailure(error: unknown): boolean {
  return classifyProviderFailure(error) !== null;
}

function providerByName(name: string): LLMProvider | undefined {
  return PROVIDER_LIST.find((candidate) => candidate.name === name);
}

/**
 * Le modèle de repli doit exister dans le registre du fournisseur, sinon
 * `getModelInstance` partirait sur un identifiant que l'API refuse — on aurait
 * troqué une panne de crédit contre une panne de modèle.
 */
function resolveChainModel(provider: LLMProvider, preferred: string): string {
  const statics = LLMManager.getInstance().getStaticModelListFromProvider(provider);

  if (statics.some((entry) => entry.name === preferred)) {
    return preferred;
  }

  const first = statics[0]?.name;

  if (!first) {
    return preferred;
  }

  logger.warn(`Modèle de repli [${preferred}] absent du registre [${provider.name}] ; bascule sur [${first}].`);

  return first;
}

export type RuntimeProviderChoice = Readonly<{
  provider: LLMProvider;
  model: string;
  switchedFrom?: Readonly<{ provider: string; reason: ProviderFailureKind; detail: string }>;
}>;

/**
 * Choisit le fournisseur à employer POUR CE TOUR, en tenant compte des échecs
 * récents. Appelé juste avant la génération : si le fournisseur demandé a
 * échoué dans les dernières minutes, le tour part directement chez le suivant
 * de la chaîne au lieu de re-provoquer la même panne.
 */
export function resolveRuntimeProvider(options: {
  provider: LLMProvider;
  model: string;
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
  now?: number;
}): RuntimeProviderChoice {
  const { provider, model, apiKeys, serverEnv, now = Date.now() } = options;
  const failure = getProviderHealth(provider.name, now);

  if (!failure) {
    return { provider, model };
  }

  for (const step of PROVIDER_FALLBACK_CHAIN) {
    if (step.provider === provider.name) {
      continue;
    }

    const candidate = providerByName(step.provider);

    if (!candidate || !isProviderUsable(candidate, apiKeys, serverEnv) || !isProviderHealthy(candidate.name, now)) {
      continue;
    }

    logger.warn(
      `Génération redirigée : [${provider.name}] écarté (${failure.kind}) → [${candidate.name}] / ${step.model}.`,
    );

    return {
      provider: candidate,
      model: resolveChainModel(candidate, step.model),
      switchedFrom: { provider: provider.name, reason: failure.kind, detail: failure.detail },
    };
  }

  /*
   * Toute la chaîne est indisponible : on RETOURNE quand même le fournisseur
   * demandé. Échouer ici priverait l'utilisateur de l'erreur réelle du
   * fournisseur, la seule qui lui dise quoi faire (recharger le crédit).
   */
  logger.error(`Aucun fournisseur de repli disponible ; [${provider.name}] est conservé malgré ${failure.kind}.`);

  return { provider, model };
}

/**
 * Sonde réelle, minimale, d'un fournisseur : un jeton, un mot.
 *
 * Sans elle, la table de santé démarre vide et le TOUT PREMIER tour après une
 * panne de crédit échouerait encore sous les yeux de l'utilisateur — le repli
 * n'aurait fait que protéger les tours suivants. La sonde passe par
 * `getModelInstance`, donc exactement le chemin d'authentification et d'URL de
 * la vraie génération : elle ne peut pas être verte pendant que la génération
 * échoue.
 *
 * Le résultat est mis en cache pour `PROVIDER_UNHEALTHY_TTL_MS`, donc au plus
 * un appel d'un jeton par fournisseur toutes les cinq minutes.
 */
export async function probeProvider(options: {
  provider: LLMProvider;
  model: string;
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
  abortSignal?: AbortSignal;
}): Promise<ProviderFailureKind | null> {
  const { provider, model, apiKeys, serverEnv, abortSignal } = options;

  const limite = AbortSignal.timeout(PROVIDER_PROBE_TIMEOUT_MS);
  const signal = abortSignal ? AbortSignal.any([abortSignal, limite]) : limite;

  try {
    await generateText({
      model: provider.getModelInstance({
        model,
        serverEnv: serverEnv as never,
        apiKeys,
        providerSettings: undefined,
      }),
      prompt: 'ping',
      maxTokens: 1,
      abortSignal: signal,
    });

    markProviderHealthy(provider.name);

    return null;
  } catch (error) {
    /*
     * Sonde expirée : on ne condamne PAS le fournisseur. Le délai vient
     * peut-être de la sonde elle-même, et écarter un fournisseur sain
     * dégraderait la génération sans rien réparer.
     */
    if (limite.aborted) {
      logger.warn(`Sonde [${provider.name}] expirée après ${PROVIDER_PROBE_TIMEOUT_MS} ms ; fournisseur conservé.`);

      return null;
    }

    const kind = classifyProviderFailure(error);

    if (!kind) {
      /*
       * La sonde a échoué pour une raison qui ne regarde pas le fournisseur.
       * On ne l'écarte PAS : le condamner sur un signal qu'on ne comprend pas
       * dégraderait la qualité de génération sans rien réparer.
       */
      logger.warn(`Sonde [${provider.name}] en échec sans cause fournisseur identifiée ; fournisseur conservé.`);

      return null;
    }

    markProviderUnhealthy(provider.name, kind, textOf(error).slice(0, 300));

    return kind;
  }
}

/**
 * Garantit qu'on connaît l'état du fournisseur demandé avant de lancer la
 * génération. Ne sonde que si l'état est inconnu : un fournisseur déjà écarté
 * n'est pas re-sondé avant l'expiration de son TTL.
 */
export async function ensureProviderProbed(options: {
  provider: LLMProvider;
  model: string;
  apiKeys?: Record<string, string>;
  serverEnv?: Record<string, string>;
  abortSignal?: AbortSignal;
  now?: number;
}): Promise<void> {
  const { provider, now = Date.now() } = options;

  if (getProviderHealth(provider.name, now) !== undefined) {
    return;
  }

  if (probed.get(provider.name) !== undefined && (probed.get(provider.name) as number) > now) {
    return;
  }

  probed.set(provider.name, now + PROVIDER_UNHEALTHY_TTL_MS);

  await probeProvider(options);
}

/** Horodatage de la dernière sonde RÉUSSIE, pour ne pas re-sonder à chaque tour. */
const probed = new Map<string, number>();

export function resetProviderProbeCache(): void {
  probed.clear();
}
