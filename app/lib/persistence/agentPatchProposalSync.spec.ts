import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteAgentPatchProposalRemote,
  fetchOpenAgentPatchProposals,
  isTerminalAgentPatchStatus,
  putAgentPatchProposal,
} from './agentPatchProposalSync';
import type { AgentPatchProposal } from '~/lib/stores/workbench';

function makeProposal(overrides: Partial<AgentPatchProposal> = {}): AgentPatchProposal {
  return {
    id: 'artifact-1:action-1',
    artifactId: 'artifact-1',
    messageId: 'msg-1',
    actionId: 'action-1',
    filePath: '/home/project/src/App.tsx',
    relativePath: 'src/App.tsx',
    originalContent: 'before',
    proposedContent: 'after',
    hunks: [],
    status: 'pending',
    createdAt: '2026-05-19T00:00:00.000Z',
    updatedAt: '2026-05-19T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('agentPatchProposalSync', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
  });

  describe('isTerminalAgentPatchStatus', () => {
    it('classifies accepted/rejected/reverted as terminal and everything else as open', () => {
      expect(isTerminalAgentPatchStatus('accepted')).toBe(true);
      expect(isTerminalAgentPatchStatus('rejected')).toBe(true);
      expect(isTerminalAgentPatchStatus('reverted')).toBe(true);
      expect(isTerminalAgentPatchStatus('pending')).toBe(false);
      expect(isTerminalAgentPatchStatus('applying')).toBe(false);
      expect(isTerminalAgentPatchStatus('failed')).toBe(false);
    });
  });

  describe('fetchOpenAgentPatchProposals', () => {
    it('hits the project-scoped endpoint with credentials + json accept and returns the proposals', async () => {
      const proposal = makeProposal();
      fetchMock.mockResolvedValueOnce(jsonResponse({ proposals: [proposal] }));

      const result = await fetchOpenAgentPatchProposals('proj-1');

      expect(result).toEqual([proposal]);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj-1/agent-patch-proposals',
        expect.objectContaining({ credentials: 'include' }),
      );
    });

    it('returns an empty array on non-OK responses without throwing', async () => {
      fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

      const result = await fetchOpenAgentPatchProposals('proj-1');

      expect(result).toEqual([]);
      expect(logSpy).toHaveBeenCalled();
    });

    it('returns an empty array when the network throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));

      const result = await fetchOpenAgentPatchProposals('proj-1');

      expect(result).toEqual([]);
      expect(logSpy).toHaveBeenCalled();
    });

    it('encodes the projectId so a slash or space in the path cannot escape the route', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ proposals: [] }));

      await fetchOpenAgentPatchProposals('proj/with space');

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/projects/proj%2Fwith%20space/agent-patch-proposals',
        expect.anything(),
      );
    });
  });

  describe('putAgentPatchProposal', () => {
    it('writes the non-terminal proposal with JSON headers and the full payload', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ proposal: makeProposal() }));

      await putAgentPatchProposal('proj-1', makeProposal({ status: 'pending' }));

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/projects/proj-1/agent-patch-proposals/artifact-1%3Aaction-1');
      expect(init.method).toBe('PUT');
      expect(init.credentials).toBe('include');

      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        artifactId: 'artifact-1',
        messageId: 'msg-1',
        actionId: 'action-1',
        relativePath: 'src/App.tsx',
        proposedContent: 'after',
        status: 'pending',
      });
    });

    it('reroutes terminal statuses to DELETE instead of persisting them', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));

      await putAgentPatchProposal('proj-1', makeProposal({ status: 'accepted' }));

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe('DELETE');
      expect(url).toBe('/api/projects/proj-1/agent-patch-proposals/artifact-1%3Aaction-1');
    });

    it('swallows network errors after logging — the nanostore stays the source of truth', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));

      await expect(putAgentPatchProposal('proj-1', makeProposal())).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('deleteAgentPatchProposalRemote', () => {
    it('issues a DELETE with the proposal id and resolves on success', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ deleted: true }));

      await deleteAgentPatchProposalRemote('proj-1', 'artifact-1:action-1');

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('/api/projects/proj-1/agent-patch-proposals/artifact-1%3Aaction-1');
      expect(init.method).toBe('DELETE');
    });

    it('logs and resolves rather than rejecting on a network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'));

      await expect(deleteAgentPatchProposalRemote('proj-1', 'x:y')).resolves.toBeUndefined();
      expect(logSpy).toHaveBeenCalled();
    });
  });
});
