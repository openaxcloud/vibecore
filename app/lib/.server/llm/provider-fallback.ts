import { generateText } from 'ai';

import { isProviderUsable, type LLMProvider } from './provider-credentials';
import { createProviderHealthScope, type ProviderHealthScope } from './provider-health-scope';
import { LLMManager } from '~/lib/modules/llm/manager';
import { hasExhaustedProviderCredits, streamErrorCodeMessages } from '~/types/context';
import type { IProviderSetting } from '~/types/model';
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

/*
 * Health belongs to one effective credential/endpoint scope, not a provider name.
 * A request may report credential failures only through the private scope supplied
 * by its actual SDK invocation. Probe results use that same resolver and scope.
 */
export type ProviderFailureKind = 'credit' | 'auth' | 'rate-limit' | 'server' | 'timeout';

/** Motifs qui portent sur la CLÉ de la plateforme — les seuls qu'un tour d'utilisateur peut propager au pod. */
const MOTIFS_DE_CLE: ReadonlySet<ProviderFailureKind> = new Set(['credit', 'auth', 'rate-limit']);

/**
 * Vrai quand un échec survenu PENDANT le tour d'un utilisateur décrit la clé de
 * la plateforme, et peut donc écarter le fournisseur pour cette portée.
 */
export function echecDeCle(kind: ProviderFailureKind | null | undefined): kind is ProviderFailureKind {
  return kind != null && MOTIFS_DE_CLE.has(kind);
}

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

/* Per-process, opaque credential scopes. Entries expire and both caches are bounded. */
const health = new Map<string, ProviderHealthEntry>();

let healthEpoch = 0;

const MAX_SCOPES = 512;

function boundCache<T>(cache: Map<string, T>): void {
  while (cache.size > MAX_SCOPES) {
    cache.delete(cache.keys().next().value!);
  }
}

/** Testable : remet la table de santé à zéro entre deux cas. */
export function resetProviderHealth(): void {
  health.clear();
  healthEpoch++;
}

export function markProviderUnhealthy(
  scope: ProviderHealthScope,
  kind: ProviderFailureKind,
  _detail: string,
  now: number = Date.now(),
  ttlMs: number = PROVIDER_UNHEALTHY_TTL_MS,
): void {
  /*
   * Garde d'exécution en plus du type : un appelant non typé (ou un `as`) ne doit
   * pas pouvoir réintroduire un motif de portée « requête » dans la table du pod.
   */
  if (!(['credit', 'auth', 'rate-limit', 'server', 'timeout'] as const).includes(kind)) {
    logger.error(`Motif [${String(kind)}] refusé : il ne peut pas écarter [${scope.provider}] pour cette portée.`);
    return;
  }

  health.set(scope.id, { kind, until: now + ttlMs, detail: kind });
  boundCache(health);
  logger.warn(`Fournisseur [${scope.provider}] écarté ${Math.round(ttlMs / 1000)}s — ${kind}`);
}

export function markProviderHealthy(scope: ProviderHealthScope): void {
  if (health.delete(scope.id)) {
    logger.info(`Fournisseur [${scope.provider}] de nouveau disponible.`);
  }
}

export function getProviderHealth(
  scope: ProviderHealthScope,
  now: number = Date.now(),
): ProviderHealthEntry | undefined {
  const entry = health.get(scope.id);

  if (!entry) {
    return undefined;
  }

  if (entry.until <= now) {
    health.delete(scope.id);
    return undefined;
  }

  return entry;
}

export function isProviderHealthy(scope: ProviderHealthScope, now: number = Date.now()): boolean {
  return getProviderHealth(scope, now) === undefined;
}

/*
 * Anthropic répond `400` — pas `402` — quand le solde est épuisé, et un 400 est
 * normalement une faute de l'appelant qu'un repli ne corrigerait pas. On ne
 * bascule donc sur un 400 QUE si le corps nomme explicitement le crédit, sinon
 * une requête réellement malformée irait épuiser toute la chaîne pour rien.
 */

/* Un quota de requêtes ou une ressource épuisée ne prouve pas un solde à zéro. */
const RATE_LIMITED =
  /rate[_ ]limit|too many requests|overloaded|quota exceeded|exceeded your current quota|resource[_ ]exhausted/i;

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

  if (hasExhaustedProviderCredits(error)) {
    return 'credit';
  }

  if (status === 401 || status === 403 || /invalid[_ ]api[_ ]key|unauthorized|permission denied/i.test(message)) {
    return 'auth';
  }

  if (status === 429 || RATE_LIMITED.test(message)) {
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
  switchedFrom?: Readonly<{ provider: string; model: string; reason: ProviderFailureKind; detail: string }>;
}>;

export type MaillonDeRepli = Readonly<{ provider: string; model: string }>;

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
  providerSettings?: Record<string, IProviderSetting>;
  now?: number;

  /*
   * LA CHAÎNE VIENT DE LA CARTE DE ROUTAGE quand il y en a une. Mesuré le
   * 2026-09-28 : un tour Anthropic écarté partait sur `gpt-4.1`, pris dans la
   * chaîne codée en dur ci-dessus, alors que la carte déclare sa propre ligne
   * `fallback`. `[]` = la carte ne déclare aucun repli : on garde le fournisseur
   * demandé et son erreur réelle. Absente = pas de carte (API injoignable) :
   * chaîne historique, en dernier recours, et la bascule reste DÉCLARÉE.
   */
  chaine?: readonly MaillonDeRepli[];
}): RuntimeProviderChoice {
  const {
    provider,
    model,
    apiKeys,
    serverEnv,
    providerSettings,
    now = Date.now(),
    chaine = PROVIDER_FALLBACK_CHAIN,
  } = options;

  const failure = getProviderHealth(createProviderHealthScope(options), now);

  if (!failure) {
    return { provider, model };
  }

  for (const step of chaine) {
    if (step.provider === provider.name) {
      continue;
    }

    const candidate = providerByName(step.provider);

    if (
      !candidate ||
      !isProviderUsable(candidate, apiKeys, serverEnv, providerSettings) ||
      !isProviderHealthy(createProviderHealthScope({ provider: candidate, apiKeys, serverEnv, providerSettings }), now)
    ) {
      continue;
    }

    logger.warn(
      `Génération redirigée : [${provider.name}] écarté (${failure.kind}) → [${candidate.name}] / ${step.model}.`,
    );

    return {
      provider: candidate,
      model: resolveChainModel(candidate, step.model),
      switchedFrom: { provider: provider.name, model, reason: failure.kind, detail: failure.detail },
    };
  }

  if (failure.kind === 'credit') {
    throw Object.assign(new Error(streamErrorCodeMessages.PROVIDER_CREDITS_EXHAUSTED), {
      code: 'PROVIDER_CREDITS_EXHAUSTED',
      statusCode: 503,
      isRetryable: false,
    });
  }

  // Preserve the existing provider diagnostic for other failure kinds.
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
  providerSettings?: Record<string, IProviderSetting>;
  abortSignal?: AbortSignal;
}): Promise<ProviderFailureKind | null | 'unobserved'> {
  const { provider, model, apiKeys, serverEnv, providerSettings, abortSignal } = options;
  const scope = createProviderHealthScope(options);
  const epoch = healthEpoch;

  const limite = AbortSignal.timeout(PROVIDER_PROBE_TIMEOUT_MS);
  const signal = abortSignal ? AbortSignal.any([abortSignal, limite]) : limite;

  try {
    await generateText({
      model: provider.getModelInstance({
        model,
        serverEnv: serverEnv as never,
        apiKeys,
        providerSettings,
      }),
      prompt: 'ping',
      maxTokens: 1,
      abortSignal: signal,
    });

    if (epoch === healthEpoch) {
      markProviderHealthy(scope);
    }

    return null;
  } catch (error) {
    /*
     * Sonde expirée : on ne condamne PAS le fournisseur. Le délai vient
     * peut-être de la sonde elle-même, et écarter un fournisseur sain
     * dégraderait la génération sans rien réparer.
     */
    if (limite.aborted) {
      logger.warn(`Sonde [${provider.name}] expirée après ${PROVIDER_PROBE_TIMEOUT_MS} ms ; fournisseur conservé.`);

      return 'unobserved';
    }

    const kind = classifyProviderFailure(error);

    if (!kind) {
      /*
       * La sonde a échoué pour une raison qui ne regarde pas le fournisseur.
       * On ne l'écarte PAS : le condamner sur un signal qu'on ne comprend pas
       * dégraderait la qualité de génération sans rien réparer.
       */
      logger.warn(`Sonde [${provider.name}] en échec sans cause fournisseur identifiée ; fournisseur conservé.`);

      return 'unobserved';
    }

    if (epoch === healthEpoch) {
      markProviderUnhealthy(scope, kind, kind);
    }

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
  providerSettings?: Record<string, IProviderSetting>;
  abortSignal?: AbortSignal;
  now?: number;
}): Promise<void> {
  const { now = Date.now() } = options;
  const scope = createProviderHealthScope(options);
  const key = `${scope.id}:${options.model}`;

  if (getProviderHealth(scope, now) !== undefined || (probed.get(key) ?? 0) > now) {
    return;
  }

  const pending = probing.get(key);

  if (pending) {
    await pending;
    return;
  }

  // Bound concurrent probes as well as completed entries; at capacity let the real request decide.
  if (probing.size >= MAX_SCOPES) {
    return;
  }

  const epoch = probeEpoch;

  const probe = probeProvider(options).then((outcome) => {
    if (epoch === probeEpoch && outcome !== 'unobserved') {
      probed.set(key, now + PROVIDER_UNHEALTHY_TTL_MS);
      boundCache(probed);
    }
  });
  probing.set(key, probe);

  try {
    await probe;
  } finally {
    if (probing.get(key) === probe) {
      probing.delete(key);
    }
  }
}

/** Expiration du dernier verdict observé, pour ne pas re-sonder à chaque tour. */
const probed = new Map<string, number>();
const probing = new Map<string, Promise<void>>();

let probeEpoch = 0;

export function resetProviderProbeCache(): void {
  probed.clear();
  probing.clear();
  probeEpoch++;
}
