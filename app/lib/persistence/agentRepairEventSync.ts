/**
 * Client helpers for the durable agent self-repair audit log
 * (backend contract §9: `agent-repair-events`).
 *
 * The transient `agent:self-repair:progress` banner lives only in memory; this
 * module mirrors each terminal repair outcome to Postgres so the repair review
 * UI can list the history across reloads. All calls are best-effort — a network
 * failure logs and returns rather than throwing, because the repair itself has
 * already happened and persistence is purely an audit concern.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('agent-repair-event-sync');

const COMMON_HEADERS = { accept: 'application/json' } as const;
const JSON_HEADERS = { ...COMMON_HEADERS, 'content-type': 'application/json' } as const;

export interface AgentRepairEvent {
  id: string;
  projectId: string;
  relativePath: string;
  attempt: number;
  outcome: 'repaired' | 'failed' | 'gave_up';
  validationError?: string | null;
  repairError?: string | null;
  messageId?: string | null;
  artifactId?: string | null;
  actionId?: string | null;
  createdAt: string;
}

export interface AgentRepairEventInput {
  relativePath: string;
  outcome: 'repaired' | 'failed' | 'gave_up';
  attempt?: number;
  validationError?: string;
  repairError?: string;
  messageId?: string;
  artifactId?: string;
  actionId?: string;
}

function endpoint(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/agent-repair-events`;
}

/**
 * Fetch the repair history (newest first). Returns an empty array on any error
 * so the caller treats "no events" and "server unreachable" identically.
 */
export async function fetchAgentRepairEvents(projectId: string, limit = 100): Promise<AgentRepairEvent[]> {
  try {
    const url = `${endpoint(projectId)}?limit=${encodeURIComponent(String(limit))}`;
    const response = await fetch(url, { credentials: 'include', headers: COMMON_HEADERS });

    if (!response.ok) {
      logger.warn(`Failed to fetch agent repair events: ${response.status}`);
      return [];
    }

    const payload = (await response.json()) as { events?: AgentRepairEvent[] };

    return payload.events ?? [];
  } catch (error) {
    logger.warn('Failed to fetch agent repair events:', error);
    return [];
  }
}

/** Append one repair event. Best-effort; never throws. */
export async function recordAgentRepairEvent(projectId: string, event: AgentRepairEventInput): Promise<void> {
  try {
    const response = await fetch(endpoint(projectId), {
      method: 'POST',
      credentials: 'include',
      headers: JSON_HEADERS,
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      logger.warn(`Failed to record agent repair event: ${response.status}`);
    }
  } catch (error) {
    logger.warn('Failed to record agent repair event:', error);
  }
}
