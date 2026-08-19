import { generateText, type Message } from 'ai';
import type { AgentRoleId } from './agent-orchestration';
import { ECODE_AGENT_ROLES } from './agent-orchestration';
import { removeUnsupportedModelSettings } from './model-compat';
import { resolveUsableProvider } from './provider-credentials';
import { classifyProviderFailure, markProviderUnhealthy, resolveRuntimeProvider } from './provider-fallback';
import { extractPropertiesFromMessage } from './utils';
import { LLMManager } from '~/lib/modules/llm/manager';
import type { IProviderSetting } from '~/types/model';
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('create-agent-plan');

/** One planned sub-task the agent decided to run, assigned to a specialist lane. */
export interface AgentPlanTask {
  title: string;
  roleId: AgentRoleId;
}

export interface AgentPlan {
  /** Ordered, prompt-specific sub-tasks the planner produced. */
  tasks: AgentPlanTask[];

  /** Distinct specialist roles actually needed for this request (the fan-out roster). */
  roleIds: AgentRoleId[];
}

const VALID_ROLE_IDS = new Set<AgentRoleId>(ECODE_AGENT_ROLES.map((role) => role.id));

function getTextContent(message: Message): string {
  const raw = message.content as unknown;

  if (typeof raw === 'string') {
    return raw;
  }

  if (Array.isArray(raw)) {
    return raw.map((part: any) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('\n');
  }

  return '';
}

/**
 * Parse + validate the planner model's JSON output into an {@link AgentPlan}.
 *
 * Pure + exported so the (lenient) JSON extraction is unit-testable without a
 * live model call. The model is asked for strict JSON, but real models wrap it
 * in prose / code fences, so we extract the first `{...}` block, drop unknown
 * role ids, cap the task count, and dedupe the roster. Returns undefined when
 * nothing usable can be recovered (caller then falls back to the full roster).
 */
export function parseAgentPlan(raw: string): AgentPlan | undefined {
  if (!raw) {
    return undefined;
  }

  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start === -1 || end <= start) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }

  if (!parsed || typeof parsed !== 'object') {
    return undefined;
  }

  const rawTasks = (parsed as { tasks?: unknown }).tasks;

  if (!Array.isArray(rawTasks)) {
    return undefined;
  }

  const tasks: AgentPlanTask[] = [];

  for (const entry of rawTasks) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }

    const title = String((entry as { title?: unknown }).title ?? '').trim();
    const roleId = String((entry as { role?: unknown; roleId?: unknown }).role ?? (entry as any).roleId ?? '').trim();

    if (!title || !VALID_ROLE_IDS.has(roleId as AgentRoleId)) {
      continue;
    }

    tasks.push({ title: title.slice(0, 160), roleId: roleId as AgentRoleId });

    // Hard cap: at most one task per lane plus a couple, keep the plan readable.
    if (tasks.length >= 12) {
      break;
    }
  }

  if (tasks.length === 0) {
    return undefined;
  }

  // Roster = the distinct roles the tasks touch, in ECODE_AGENT_ROLES order.
  const touched = new Set(tasks.map((task) => task.roleId));
  const roleIds = ECODE_AGENT_ROLES.map((role) => role.id).filter((id) => touched.has(id));

  return { tasks, roleIds };
}

/**
 * Prompt-driven planner: ask the user's selected model to decompose the build
 * request into specialist sub-tasks BEFORE the parallel fan-out, so the roster
 * is tailored to the request (Replit-style) instead of always running the fixed
 * 5 roles. Returns the plan, or undefined on any failure (caller falls back to
 * the full roster — fail-open, never blocks the chat).
 *
 * Mirrors create-summary.ts for provider/model resolution so the planner runs on
 * the SAME model the user picked.
 */
/**
 * Consigne de langue ajoutée au prompt de planification.
 *
 * Le `title` de chaque tâche est rendu tel quel dans le panneau de plan, et il
 * est ÉCRIT PAR LE MODÈLE — pas lu dans un catalogue. Sans cette consigne, il
 * les rédigeait en anglais au milieu d'une interface française, y compris quand
 * il avait compris que l'application à construire, elle, devait être en
 * français (BUG-I18N-003).
 *
 * La langue visée est celle de L'INTERFACE, et elle seule : un francophone peut
 * demander une application en anglais, son plan doit rester en français.
 */
export function buildPlanLanguageRule(language?: string): string {
  if (language !== 'fr') {
    return '';
  }

  return '- Write every task title in FRENCH — the interface is French. The language of the app being built does not change this.\n';
}

export async function createAgentPlan(props: {
  messages: Message[];
  env?: Env;
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  abortSignal?: AbortSignal;
  maxRoles?: number;

  /**
   * Langue de l'interface, telle que résolue par la route. Les intitulés de
   * tâches affichés dans le plan sont ÉCRITS PAR LE MODÈLE, pas lus dans un
   * catalogue : sans consigne, il les rédige en anglais au milieu d'une
   * interface française — y compris quand il a compris que l'application à
   * construire, elle, doit être en français.
   */
  language?: string;
}): Promise<AgentPlan | undefined> {
  const { messages, env: serverEnv, apiKeys, providerSettings, abortSignal, maxRoles, language } = props;

  const lastUser = [...messages].reverse().find((message) => message.role === 'user');

  if (!lastUser) {
    return undefined;
  }

  let currentModel = DEFAULT_MODEL;
  let currentProvider = DEFAULT_PROVIDER.name;

  const { model, provider } = extractPropertiesFromMessage(lastUser);
  currentModel = model;
  currentProvider = provider;

  /* Retenu hors du `try` pour que le chemin d'erreur sache QUEL fournisseur a refusé. */
  let fournisseurDuTour = currentProvider;

  try {
    const resolved = resolveUsableProvider({
      requestedProvider: currentProvider,
      requestedModel: currentModel,
      apiKeys,
      serverEnv: serverEnv as Record<string, string> | undefined,
    });

    /*
     * Le planificateur est un chemin d'appel SÉPARÉ de `streamText`, et il
     * résolvait son fournisseur pour lui seul. Mesuré en production le 19/08,
     * juste après la certification du repli : la génération basculait bien sur
     * OpenAI, mais le plan, lui, mourait encore —
     *
     *     create-agent-plan  Agent planner failed: Your credit balance is too low…
     *
     * L'échec n'est pas fatal (l'agent retombe sur le rôle complet), mais il
     * coûte un appel pour rien et prive l'utilisateur du plan alors que DEUX
     * fournisseurs répondent. Le repli s'applique donc ici aussi.
     */
    const runtimeChoice = resolveRuntimeProvider({
      provider: resolved.provider,
      model: resolved.model,
      apiKeys,
      serverEnv: serverEnv as Record<string, string> | undefined,
    });

    const resolvedProvider = runtimeChoice.provider;
    currentModel = runtimeChoice.model;
    fournisseurDuTour = resolvedProvider.name;

    if (runtimeChoice.switchedFrom) {
      logger.warn(
        `Plan redirigé : [${runtimeChoice.switchedFrom.provider}] écarté (${runtimeChoice.switchedFrom.reason}) → [${resolvedProvider.name}] / ${currentModel}.`,
      );
    }

    const staticModels = LLMManager.getInstance().getStaticModelListFromProvider(resolvedProvider);

    let modelDetails = staticModels.find((m) => m.name === currentModel);

    if (!modelDetails) {
      const modelsList = [
        ...(resolvedProvider.staticModels || []),
        ...(await LLMManager.getInstance().getModelListFromProvider(resolvedProvider, {
          apiKeys,
          providerSettings,
          serverEnv: serverEnv as any,
        })),
      ];

      if (!modelsList.length) {
        return undefined;
      }

      modelDetails = modelsList.find((m) => m.name === currentModel) ?? modelsList[0];
    }

    /*
     * `modelsList[0]` reste `undefined` pour le vérificateur (accès indexé non
     * garanti). Sans cette garde, un registre vide partirait construire une
     * instance de modèle sur `undefined.name`.
     */
    if (!modelDetails) {
      return undefined;
    }

    const roleCatalog = ECODE_AGENT_ROLES.map((role) => `- ${role.id}: ${role.responsibility}`).join('\n');

    const roleCap = Math.max(1, Math.min(maxRoles ?? ECODE_AGENT_ROLES.length, ECODE_AGENT_ROLES.length));

    const resp = await generateText({
      system: `You are the planning layer of an autonomous coding agent. Given a build request, decompose it into the specialist sub-tasks needed to deliver it, and assign each sub-task to ONE specialist role.

Available roles:
${roleCatalog}

Rules:
- Only include roles that are genuinely needed for THIS request (e.g. a static landing page needs no backend/devops).
- Use at most ${roleCap} distinct roles.
- Order tasks in execution order (architecture first, QA last).
${buildPlanLanguageRule(language)}- Output STRICT JSON only, no prose, no code fences:
{"tasks":[{"title":"<short imperative task>","role":"<roleId>"}]}`,
      prompt: `Build request:\n${getTextContent(lastUser).slice(0, 4000)}\n\nReturn the JSON plan.`,
      model: removeUnsupportedModelSettings(
        resolvedProvider.getModelInstance({
          model: modelDetails.name,
          serverEnv,
          apiKeys,
          providerSettings,
        }),
        modelDetails.name,
        modelDetails.provider,
      ),

      // A plan is small; cap output so the planning step is cheap + fast.
      maxTokens: Math.min(modelDetails.maxTokenAllowed ?? 700, 700),
      ...(abortSignal ? { abortSignal } : {}),
    });

    const plan = parseAgentPlan(resp.text);

    if (!plan) {
      logger.warn('Agent planner returned no usable plan; falling back to full roster.');
      return undefined;
    }

    // Respect the role cap (entitlement / power tier) on the produced roster.
    if (plan.roleIds.length > roleCap) {
      const allowed = new Set(plan.roleIds.slice(0, roleCap));

      return {
        roleIds: plan.roleIds.slice(0, roleCap),
        tasks: plan.tasks.filter((task) => allowed.has(task.roleId)),
      };
    }

    return plan;
  } catch (error) {
    /*
     * Signale la panne au repli. Le planificateur tourne AVANT la génération :
     * s'il essuie un refus de crédit, c'est lui qui l'apprend en premier, et
     * marquer le fournisseur ici évite que la génération qui suit immédiatement
     * ne retape le même mur.
     */
    const kind = classifyProviderFailure(error);

    if (kind) {
      markProviderUnhealthy(fournisseurDuTour, kind, String(error).slice(0, 300));
    }

    logger.warn(`Agent planner failed: ${error instanceof Error ? error.message : error}`);

    return undefined;
  }
}
