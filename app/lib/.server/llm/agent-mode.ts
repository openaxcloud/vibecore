/**
 * Agent mode routing (AGM) — the app-side half of the control-plane decision.
 *
 * The user picks a MODE (Lite / Economy / Power — never a model), the api's
 * versioned routing card maps it to a concrete provider+model, and this module
 * fetches that decision per request and applies it to the generation. High
 * effort escalates ONLY on genuinely hard tasks: a heuristic pre-classifier
 * (free) short-circuits the easy cases, and the routing card's dedicated
 * classifier line (a fast/cheap model, billed to us — never the user) confirms
 * the hard ones.
 *
 * Kill-switch: AGENT_MODE_ROUTING_DISABLED=1 restores the legacy behaviour
 * (client-supplied [Model:]/[Provider:] tags) byte for byte.
 */
import { generateText } from 'ai';

import { removeUnsupportedModelSettings } from './model-compat';
import { classifyTask, type OutputBudgetInput } from './output-budget';
import { resolveUsableProvider } from './provider-credentials';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('agent-mode');

export type AgentMode = 'lite' | 'economy' | 'power';

export const DEFAULT_AGENT_MODE: AgentMode = 'economy';

export interface AgentModeSelection {
  mode: AgentMode;
  highEffort: boolean;
  turbo: boolean;
}

/**
 * Normalise the composer's agentPower payload into the mode selection.
 * Back-compat: the legacy `highPowerModel` boost maps onto High effort.
 */
export function normalizeAgentSelection(agentPower?: {
  buildTier?: string;
  highEffort?: boolean;
  highPowerModel?: boolean;
  turboMode?: boolean;
}): AgentModeSelection {
  const mode =
    agentPower?.buildTier === 'lite' || agentPower?.buildTier === 'power' ? agentPower.buildTier : DEFAULT_AGENT_MODE;

  return {
    mode,
    highEffort: mode !== 'lite' && Boolean(agentPower?.highEffort ?? agentPower?.highPowerModel),
    turbo: mode === 'power' && Boolean(agentPower?.turboMode),
  };
}

/** Gateway provider ids (routing card) → Bolt provider registry names. */
const PROVIDER_NAME_BY_GATEWAY_ID: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  'google-gemini': 'Google',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  xai: 'xAI',
  ollama: 'Ollama',
};

export function boltProviderName(gatewayProviderId: string): string {
  return PROVIDER_NAME_BY_GATEWAY_ID[gatewayProviderId] ?? gatewayProviderId;
}

export interface AgentRouteLine {
  lineKey: string;
  provider: string;
  model: string;
  multiplier: number;
}

export interface AgentRouteResolution {
  routingVersion: number;
  mode: AgentMode;
  plan: string;
  base: AgentRouteLine;
  escalation?: AgentRouteLine;
  classifier?: { provider: string; model: string };
}

export type AgentRouteResult =
  | { ok: true; route: AgentRouteResolution }
  | { ok: false; statusCode: number; code: string; message: string }
  | { ok: 'unavailable' };

export function isAgentModeRoutingDisabled(env?: Record<string, string | undefined>): boolean {
  const raw =
    env?.AGENT_MODE_ROUTING_DISABLED ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
      ?.AGENT_MODE_ROUTING_DISABLED;

  if (raw === undefined || raw === null || raw === '') {
    return false;
  }

  const normalized = String(raw).trim().toLowerCase();

  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

/*
 * Same base-url resolution as ai-usage.ts: vite shims process.env in SSR, so
 * read the real env off globalThis and fall back to the in-cluster service.
 */
const IN_CLUSTER_API_URL = 'http://vibecore-vibecore-platform-api.vibecore.svc.cluster.local:3001';

function apiBaseUrl() {
  const env = ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}) as Record<
    string,
    string | undefined
  >;

  const fromEnv = env.SAAS_API_URL ?? env.API_BASE_URL ?? env.VITE_API_URL;

  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  return process.env.NODE_ENV === 'production' ? IN_CLUSTER_API_URL : 'http://localhost:3001';
}

/**
 * Resolve the (mode, switches) → concrete route against the api's ACTIVE
 * routing card. Three outcomes:
 * - ok:true      → route resolved; apply it to the generation.
 * - ok:false     → the api REFUSED the mode/switch for this plan/org (403).
 *                  Surface the refusal — never silently downgrade.
 * - 'unavailable'→ api unreachable/error; the caller falls back to the legacy
 *                  path so a degraded api never breaks chat.
 */
export async function resolveAgentRoute(input: {
  projectId?: string;
  selection: AgentModeSelection;
  cookieHeader?: string;
}): Promise<AgentRouteResult> {
  if (!input.projectId || !input.cookieHeader) {
    return { ok: 'unavailable' };
  }

  const url =
    `${apiBaseUrl().replace(/\/+$/, '')}/projects/${encodeURIComponent(input.projectId)}/agent/routing/resolve` +
    `?mode=${input.selection.mode}&highEffort=${input.selection.highEffort}&turbo=${input.selection.turbo}`;

  /*
   * Same auth bridge as ai-usage.ts: the api authenticates a Bearer token, not
   * a raw browser Cookie header — extract vc_session and send it as
   * Authorization (a raw cookie pass-through 401s and silently downgraded
   * every request to the legacy path).
   */
  const sessionToken = (() => {
    const match = input.cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('vc_session='));

    if (!match) {
      return undefined;
    }

    try {
      return decodeURIComponent(match.slice('vc_session='.length));
    } catch {
      return undefined;
    }
  })();

  if (!sessionToken) {
    return { ok: 'unavailable' };
  }

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', authorization: `Bearer ${sessionToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status === 403) {
      const body = (await response.json().catch(() => ({}))) as { code?: string; error?: string };

      return {
        ok: false,
        statusCode: 403,
        code: body.code ?? 'AGENT_MODE_NOT_ALLOWED',
        message: body.error ?? '',
      };
    }

    if (!response.ok) {
      logger.warn(JSON.stringify({ event: 'agent-mode.resolve.api-error', status: response.status }));
      return { ok: 'unavailable' };
    }

    const route = (await response.json()) as AgentRouteResolution;

    if (!route?.base?.model || !route?.base?.provider) {
      return { ok: 'unavailable' };
    }

    return { ok: true, route };
  } catch (error) {
    logger.warn(
      JSON.stringify({
        event: 'agent-mode.resolve.failed',
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    return { ok: 'unavailable' };
  }
}

export interface HardnessDecision {
  hard: boolean;

  /** 'heuristic' when classifyTask decided alone; 'llm' when the classifier line confirmed. */
  decidedBy: 'heuristic' | 'llm';
  taskClass: string;

  /** Classifier call usage (present only when the LLM ran) — logged as our operating cost. */
  classifierUsage?: { provider: string; model: string; inputTokens: number; outputTokens: number };
}

/**
 * Is this task genuinely hard? Two stages so the escalation surcharge is never
 * systematic:
 * 1. classifyTask (free heuristic): discuss/smallEdit → NOT hard, done.
 * 2. build/scaffold → confirm with the routing card's classifier model (one
 *    tiny yes/no completion). LLM failure falls back to the heuristic verdict.
 */
export async function decideTaskHardness(input: {
  task: OutputBudgetInput;
  lastUserMessage: string;
  classifier?: { provider: string; model: string };
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, unknown>;
  serverEnv?: Record<string, string>;
  classifierReplay?: { state: 'exact' | 'recovered'; outcome?: 'hard' | 'easy' };
  onClassifierStart?: (intent: {
    callId: 'classifier';
    provider: string;
    model: string;
    maxInputTokens: number;
    maxOutputTokens: number;
  }) => Promise<void>;
}): Promise<HardnessDecision> {
  const taskClass = classifyTask(input.task);
  const heuristicHard = taskClass === 'build' || taskClass === 'scaffold';

  if (!heuristicHard || !input.classifier) {
    return { hard: heuristicHard, decidedBy: 'heuristic', taskClass };
  }

  if (input.classifierReplay) {
    if (input.classifierReplay.state === 'exact' && input.classifierReplay.outcome) {
      return {
        hard: input.classifierReplay.outcome === 'hard',
        decidedBy: 'llm',
        taskClass,
      };
    }

    /*
     * A crash-recovered ceiling proves a provider call happened but cannot
     * reconstruct its verdict; reuse the pre-provider heuristic without
     * charging or invoking the classifier twice.
     */
    return { hard: heuristicHard, decidedBy: 'heuristic', taskClass };
  }

  try {
    const resolved = resolveUsableProvider({
      requestedProvider: boltProviderName(input.classifier.provider),
      requestedModel: input.classifier.model,
      apiKeys: input.apiKeys,
      serverEnv: input.serverEnv,
    });

    const system =
      'You classify coding tasks by difficulty for model routing. Answer with EXACTLY one word: ' +
      '"hard" when the task needs deep multi-step reasoning (new app from scratch, architecture change, ' +
      'new integration, database schema change, large refactor), otherwise "easy". No other output.';

    const prompt = input.lastUserMessage.slice(0, 4000);
    const actualProvider = resolved.provider.name;
    const maxOutputTokens = 8;

    /*
     * Persist the platform-cost intent before the classifier can reach the
     * provider. Four UTF-16 code units per token is a typical estimate; divide
     * by three here to keep the crash-recovery ceiling deliberately
     * conservative without trusting caller-supplied usage.
     */
    await input.onClassifierStart?.({
      callId: 'classifier',
      provider: actualProvider,
      model: resolved.model,
      maxInputTokens: Math.ceil((system.length + prompt.length) / 3),
      maxOutputTokens,
    });

    const response = await generateText({
      model: removeUnsupportedModelSettings(
        resolved.provider.getModelInstance({
          model: resolved.model,
          serverEnv: input.serverEnv as never,
          apiKeys: input.apiKeys,
          providerSettings: input.providerSettings as never,
        }),
        resolved.model,
        resolved.provider.name,
      ),
      system,
      prompt,
      maxTokens: maxOutputTokens,
    });

    const verdict = response.text.trim().toLowerCase();
    const hard = verdict.startsWith('hard');

    return {
      hard,
      decidedBy: 'llm',
      taskClass,
      classifierUsage: {
        provider: actualProvider,
        model: resolved.model,
        inputTokens: response.usage?.promptTokens ?? 0,
        outputTokens: response.usage?.completionTokens ?? 0,
      },
    };
  } catch (error) {
    logger.warn(
      JSON.stringify({
        event: 'agent-mode.classifier.failed',
        error: error instanceof Error ? { kind: 'error', name: error.name } : { kind: typeof error },
      }),
    );

    // Heuristic said hard and the confirmer is down: trust the heuristic.
    return { hard: true, decidedBy: 'heuristic', taskClass };
  }
}
