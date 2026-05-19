/**
 * Server-sync helpers for the workbench AgentPatchProposal nanostore.
 *
 * The nanostore is the source of truth client-side; this module is a
 * write-through layer that mirrors non-terminal proposals to Postgres so
 * the queue survives a workbench reload. Terminal-state proposals
 * (accepted / rejected / reverted) are hard-deleted server-side — they
 * carry no further user action and the audit trail lives in
 * ProjectActivity separately.
 *
 * All calls are best-effort: a network failure logs and returns rather
 * than throwing, because the nanostore has already applied the update.
 * The server eventually catches up on the next mutation.
 */

import type { AgentPatchProposal } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('agent-patch-proposal-sync');

const TERMINAL_STATUSES = new Set(['accepted', 'rejected', 'reverted']);

export function isTerminalAgentPatchStatus(status: AgentPatchProposal['status']): boolean {
  return TERMINAL_STATUSES.has(status);
}

interface ListResponse {
  proposals: AgentPatchProposal[];
}

const COMMON_HEADERS = { accept: 'application/json' } as const;
const JSON_HEADERS = { ...COMMON_HEADERS, 'content-type': 'application/json' } as const;

function endpoint(projectId: string, proposalId?: string) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/agent-patch-proposals`;
  return proposalId ? `${base}/${encodeURIComponent(proposalId)}` : base;
}

/**
 * Fetch every non-terminal proposal for the project. Returns an empty
 * array on any error so the caller can treat "no proposals" and "server
 * unreachable" identically — the user just sees an empty review queue.
 */
export async function fetchOpenAgentPatchProposals(projectId: string): Promise<AgentPatchProposal[]> {
  try {
    const response = await fetch(endpoint(projectId), {
      credentials: 'include',
      headers: COMMON_HEADERS,
    });

    if (!response.ok) {
      logger.warn(`Failed to fetch agent patch proposals: ${response.status}`);
      return [];
    }

    const payload = (await response.json()) as ListResponse;

    return payload.proposals ?? [];
  } catch (error) {
    logger.warn('Failed to fetch agent patch proposals:', error);
    return [];
  }
}

/**
 * Upsert one proposal. The id is the nanostore key (artifactId:actionId);
 * the route uses it verbatim so client and server stay 1:1.
 */
export async function putAgentPatchProposal(projectId: string, proposal: AgentPatchProposal): Promise<void> {
  const status = proposal.status;

  if (isTerminalAgentPatchStatus(status)) {
    /*
     * Terminal statuses should be deleted, not written. Callers route
     * terminal transitions through `deleteAgentPatchProposal`, but we
     * defend here so a misuse can't accidentally persist a row the
     * hydration would then load back into the review queue.
     */
    await deleteAgentPatchProposalRemote(projectId, proposal.id);
    return;
  }

  try {
    const response = await fetch(endpoint(projectId, proposal.id), {
      method: 'PUT',
      credentials: 'include',
      headers: JSON_HEADERS,
      body: JSON.stringify({
        artifactId: proposal.artifactId,
        messageId: proposal.messageId,
        actionId: proposal.actionId,
        filePath: proposal.filePath,
        relativePath: proposal.relativePath,
        originalContent: proposal.originalContent,
        proposedContent: proposal.proposedContent,
        hunks: proposal.hunks,
        status,
        error: proposal.error,
      }),
    });

    if (!response.ok) {
      logger.warn(`Failed to upsert agent patch proposal ${proposal.id}: ${response.status}`);
    }
  } catch (error) {
    logger.warn(`Failed to upsert agent patch proposal ${proposal.id}:`, error);
  }
}

export async function deleteAgentPatchProposalRemote(projectId: string, proposalId: string): Promise<void> {
  try {
    const response = await fetch(endpoint(projectId, proposalId), {
      method: 'DELETE',
      credentials: 'include',
      headers: COMMON_HEADERS,
    });

    if (!response.ok) {
      logger.warn(`Failed to delete agent patch proposal ${proposalId}: ${response.status}`);
    }
  } catch (error) {
    logger.warn(`Failed to delete agent patch proposal ${proposalId}:`, error);
  }
}
