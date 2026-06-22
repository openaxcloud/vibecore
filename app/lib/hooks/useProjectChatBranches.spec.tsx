/**
 * @vitest-environment jsdom
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectChatBranches } from './useProjectChatBranches';
import type { ProjectIdeMemory } from '~/lib/persistence/projectIdeMemory';

/*
 * Mock the persistence module so we don't reach for localStorage or
 * fetch. The mock keeps an in-memory store keyed by projectId, mirrors
 * subscribe / save semantics, and is shared across the suite via
 * `loadMockState` / `applyMockPatch` helpers below.
 */
const mockState = new Map<string, ProjectIdeMemory>();
const mockListeners = new Map<string, Set<(memory: ProjectIdeMemory) => void>>();

function applyMockPatch(projectId: string, patch: ProjectIdeMemory) {
  const previous = mockState.get(projectId) ?? {};

  const merged: ProjectIdeMemory = {
    ...previous,
    ...patch,
    chat: {
      ...previous.chat,
      ...patch.chat,
      conversations: patch.chat?.conversations ?? previous.chat?.conversations,
    },
  };
  mockState.set(projectId, merged);

  for (const listener of mockListeners.get(projectId) ?? []) {
    listener(merged);
  }
}

vi.mock('~/lib/persistence/projectIdeMemory', () => ({
  getProjectIdeMemory: vi.fn(async (projectId: string) => mockState.get(projectId) ?? {}),
  getProjectIdeMemorySync: vi.fn((projectId: string) => mockState.get(projectId)),
  saveProjectIdeMemory: vi.fn(async (projectId: string, patch: ProjectIdeMemory) => {
    applyMockPatch(projectId, patch);
  }),
  subscribeProjectIdeMemory: vi.fn((projectId: string, listener: (memory: ProjectIdeMemory) => void) => {
    let set = mockListeners.get(projectId);

    if (!set) {
      set = new Set();
      mockListeners.set(projectId, set);
    }

    set.add(listener);

    return () => {
      set?.delete(listener);
    };
  }),
}));

function seed(projectId: string, conversations: NonNullable<NonNullable<ProjectIdeMemory['chat']>['conversations']>) {
  mockState.set(projectId, { chat: { conversations } });
}

function userMessage(id: string, content: string): Message {
  return { id, role: 'user', content };
}

function assistantMessage(id: string, content: string): Message {
  return { id, role: 'assistant', content };
}

describe('useProjectChatBranches', () => {
  beforeEach(() => {
    mockState.clear();
    mockListeners.clear();
  });

  afterEach(() => {
    mockState.clear();
    mockListeners.clear();
  });

  it('returns the seeded conversations once they hydrate', async () => {
    seed('proj-1', [{ id: 'root', messages: [userMessage('u1', 'hi'), assistantMessage('a1', 'hello')] }]);

    const { result } = renderHook(() => useProjectChatBranches('proj-1'));

    await waitFor(() => expect(result.current.conversations.length).toBe(1));
    expect(result.current.conversations[0].id).toBe('root');
    expect(result.current.tree.length).toBe(1);
  });

  it('fork() persists a new branch and exposes it via the tree', async () => {
    seed('proj-1', [{ id: 'root', messages: [userMessage('u1', 'hi'), assistantMessage('a1', 'hello')] }]);

    const { result } = renderHook(() => useProjectChatBranches('proj-1'));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    let forkedId: string | undefined;
    await act(async () => {
      forkedId = await result.current.fork('root', 'a1', { newConversationId: 'fork-1', newTitle: 'After hello' });
    });

    expect(forkedId).toBe('fork-1');
    await waitFor(() => expect(result.current.conversations.length).toBe(2));

    const forked = result.current.conversations.find((conversation) => conversation.id === 'fork-1');
    expect(forked?.parentId).toBe('root');
    expect(forked?.branchedFromMessageId).toBe('a1');
    expect(forked?.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
  });

  it('fork() returns undefined when the source id is unknown', async () => {
    seed('proj-1', [{ id: 'root', messages: [userMessage('u1', 'hi')] }]);

    const { result } = renderHook(() => useProjectChatBranches('proj-1'));
    await waitFor(() => expect(result.current.conversations.length).toBe(1));

    let forkedId: string | undefined;
    await act(async () => {
      forkedId = await result.current.fork('ghost', 'u1');
    });

    expect(forkedId).toBeUndefined();
    expect(result.current.conversations.length).toBe(1);
  });

  it('rename() updates the title of the target conversation', async () => {
    seed('proj-1', [
      { id: 'root', messages: [], title: 'Original' },
      { id: 'child', messages: [], title: 'Keep me' },
    ]);

    const { result } = renderHook(() => useProjectChatBranches('proj-1'));
    await waitFor(() => expect(result.current.conversations.length).toBe(2));

    await act(async () => {
      await result.current.rename('root', 'Renamed');
    });

    await waitFor(() => {
      const root = result.current.conversations.find((conversation) => conversation.id === 'root');
      expect(root?.title).toBe('Renamed');
    });

    const child = result.current.conversations.find((conversation) => conversation.id === 'child');
    expect(child?.title).toBe('Keep me');
  });

  it('remove() prunes the target conversation and its descendants', async () => {
    seed('proj-1', [
      { id: 'root', messages: [] },
      { id: 'child', messages: [], parentId: 'root' },
      { id: 'grandchild', messages: [], parentId: 'child' },
      { id: 'sibling', messages: [], parentId: 'root' },
    ]);

    const { result } = renderHook(() => useProjectChatBranches('proj-1'));
    await waitFor(() => expect(result.current.conversations.length).toBe(4));

    await act(async () => {
      await result.current.remove('child');
    });

    await waitFor(() => expect(result.current.conversations.length).toBe(2));

    expect(result.current.conversations.map((conversation) => conversation.id).sort()).toEqual(['root', 'sibling']);
  });
});
