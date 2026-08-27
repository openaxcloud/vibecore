/**
 * Active Agent Routing Card resolution — DB-backed, versioned, built-in
 * fallback. Mirrors rate-card-service.ts: the DB row (`AgentRoutingCard`) is
 * authoritative so changing which model a mode routes to is an INSERT + active
 * flip (a config change), never a deployment. The built-in card from
 * packages/billing is the fallback when the table is empty or the stored JSON
 * fails validation — mode routing must never 500 the chat path.
 *
 * Cached for 60s per process; every logged call stamps the card version it
 * was actually priced with, so a stale-by-a-minute card is harmless.
 */
import { BUILTIN_AGENT_ROUTING_CARD, type AgentRoutingCard } from '@vibecore/billing';
import { z } from 'zod';

import type { ApiStore } from './store.js';

const routingLineSchema = z.object({
  key: z.enum(['lite', 'economy', 'power', 'high-effort', 'turbo', 'classifier']),
  label: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  costInCentsPerM: z.number().nonnegative(),
  costOutCentsPerM: z.number().nonnegative(),
  multiplier: z.number().nonnegative(),
  billedToUser: z.boolean(),
  availablePlans: z.array(z.string()),
  active: z.boolean(),
});

export const agentRoutingCardSchema = z.object({
  version: z.number().int().positive(),
  effectiveFrom: z.string().min(1),
  effectiveTo: z.string().optional(),
  sourceDate: z.string().min(1),
  currency: z.literal('usd'),
  baseUserInCentsPerM: z.number().nonnegative(),
  baseUserOutCentsPerM: z.number().nonnegative(),
  lines: z.array(routingLineSchema).min(1),
});

const CACHE_TTL_MS = 60_000;

let cached: { card: AgentRoutingCard; at: number } | undefined;

/** Test hook: drop the process-level cache. */
export function resetAgentRoutingCache() {
  cached = undefined;
}

export async function getActiveAgentRoutingCard(
  store: Pick<ApiStore, 'getActiveAgentRoutingCard'>,
): Promise<AgentRoutingCard> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.card;
  }

  let card: AgentRoutingCard = BUILTIN_AGENT_ROUTING_CARD;

  try {
    const row = await store.getActiveAgentRoutingCard();

    if (row) {
      const parsed = agentRoutingCardSchema.safeParse(row.data);

      if (parsed.success) {
        card = parsed.data as AgentRoutingCard;
      } else {
        console.error('agent-routing: active DB row failed validation, using built-in card', {
          version: row.version,
          issues: parsed.error.issues.slice(0, 3),
        });
      }
    }
  } catch (error) {
    console.error('agent-routing: read failed, using built-in card', { error: (error as Error).message });
  }

  cached = { card, at: Date.now() };

  return card;
}

/**
 * Resolve an immutable historical card for a durable provider-intent replay.
 * Unlike the active-card helper this never substitutes a different version.
 * The built-in card is a valid historical fallback only when the table is
 * empty and the requested version exactly matches that built-in document.
 */
export async function getAgentRoutingCardByVersion(
  store: Pick<ApiStore, 'getAgentRoutingCard'>,
  version: number,
): Promise<AgentRoutingCard | undefined> {
  const row = await store.getAgentRoutingCard(version);
  if (!row) {
    return version === BUILTIN_AGENT_ROUTING_CARD.version ? BUILTIN_AGENT_ROUTING_CARD : undefined;
  }
  const parsed = agentRoutingCardSchema.safeParse(row.data);
  if (!parsed.success || parsed.data.version !== row.version || row.version !== version) {
    return undefined;
  }
  return parsed.data as AgentRoutingCard;
}

/**
 * Boot seed: insert the built-in card as version 1 when the table is empty.
 * Idempotent and non-destructive — an existing history is never touched, so
 * admin edits always survive restarts.
 */
export async function seedAgentRoutingCard(
  store: Pick<ApiStore, 'getActiveAgentRoutingCard' | 'countAgentRoutingCards' | 'insertAgentRoutingCard'>,
): Promise<void> {
  try {
    const existing = await store.countAgentRoutingCards();

    if (existing > 0) {
      return;
    }

    await store.insertAgentRoutingCard({
      version: BUILTIN_AGENT_ROUTING_CARD.version,
      data: BUILTIN_AGENT_ROUTING_CARD,
      sourceDate: BUILTIN_AGENT_ROUTING_CARD.sourceDate,
      effectiveFrom: BUILTIN_AGENT_ROUTING_CARD.effectiveFrom,
      active: true,
    });
  } catch (error) {
    console.error('agent-routing: seed failed (non-fatal, built-in fallback covers reads)', {
      error: (error as Error).message,
    });
  }
}
