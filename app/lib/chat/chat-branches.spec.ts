import type { Message } from 'ai';
import { describe, expect, it } from 'vitest';

import {
  branchConversationFromMessage,
  buildBranchTree,
  getBranchPath,
  listBranchesOf,
  pruneBranch,
  type BranchedConversation,
} from './chat-branches';

function userMessage(id: string, content: string): Message {
  return { id, role: 'user', content };
}

function assistantMessage(id: string, content: string): Message {
  return { id, role: 'assistant', content };
}

const SOURCE: BranchedConversation = {
  id: 'root',
  title: 'Root thread',
  createdAt: '2026-05-15T09:00:00.000Z',
  messages: [
    userMessage('u1', 'Build a todo app'),
    assistantMessage('a1', 'Here is the plan…'),
    userMessage('u2', 'Add dark mode'),
    assistantMessage('a2', 'Wired the theme switcher.'),
  ],
};

describe('branchConversationFromMessage', () => {
  it('forks a new conversation up to and including the branch point', () => {
    const forked = branchConversationFromMessage({
      source: SOURCE,
      branchPointMessageId: 'a1',
      newConversationId: 'fork-1',
      now: () => new Date('2026-05-15T10:00:00.000Z'),
    });

    expect(forked).toBeDefined();
    expect(forked!.id).toBe('fork-1');
    expect(forked!.parentId).toBe('root');
    expect(forked!.branchedFromMessageId).toBe('a1');
    expect(forked!.messages.map((message) => message.id)).toEqual(['u1', 'a1']);
    expect(forked!.createdAt).toBe('2026-05-15T10:00:00.000Z');
  });

  it('returns undefined when the branch-point id is missing', () => {
    const result = branchConversationFromMessage({
      source: SOURCE,
      branchPointMessageId: 'ghost',
      newConversationId: 'fork-2',
    });

    expect(result).toBeUndefined();
  });
});

describe('buildBranchTree', () => {
  it('returns roots and nests children under their parents', () => {
    const conversations: BranchedConversation[] = [
      { id: 'root-a', messages: [], createdAt: '2026-05-15T09:00:00.000Z' },
      { id: 'root-b', messages: [], createdAt: '2026-05-15T08:00:00.000Z' },
      {
        id: 'child-1',
        messages: [],
        parentId: 'root-a',
        createdAt: '2026-05-15T09:30:00.000Z',
      },
      {
        id: 'child-2',
        messages: [],
        parentId: 'root-a',
        createdAt: '2026-05-15T09:45:00.000Z',
      },
      {
        id: 'grandchild',
        messages: [],
        parentId: 'child-1',
        createdAt: '2026-05-15T10:00:00.000Z',
      },
    ];

    const tree = buildBranchTree(conversations);

    expect(tree.map((node) => node.conversation.id)).toEqual(['root-b', 'root-a']);

    const rootA = tree.find((node) => node.conversation.id === 'root-a')!;
    expect(rootA.children.map((node) => node.conversation.id)).toEqual(['child-1', 'child-2']);

    const child1 = rootA.children[0];
    expect(child1.children.map((node) => node.conversation.id)).toEqual(['grandchild']);
  });

  it('treats unknown parent ids as roots', () => {
    const tree = buildBranchTree([{ id: 'orphan', messages: [], parentId: 'missing-parent' }]);

    expect(tree.map((node) => node.conversation.id)).toEqual(['orphan']);
  });
});

describe('listBranchesOf', () => {
  it('returns only the direct children of the given parent', () => {
    const conversations: BranchedConversation[] = [
      { id: 'a', messages: [] },
      { id: 'b', messages: [], parentId: 'a' },
      { id: 'c', messages: [], parentId: 'a' },
      { id: 'd', messages: [], parentId: 'b' },
    ];

    const branches = listBranchesOf(conversations, 'a').map((conversation) => conversation.id);
    expect(branches.sort()).toEqual(['b', 'c']);
  });
});

describe('getBranchPath', () => {
  it('walks the ancestry root-first', () => {
    const conversations: BranchedConversation[] = [
      { id: 'a', messages: [] },
      { id: 'b', messages: [], parentId: 'a' },
      { id: 'c', messages: [], parentId: 'b' },
    ];

    expect(getBranchPath(conversations, 'c').map((conversation) => conversation.id)).toEqual(['a', 'b', 'c']);
  });

  it('survives a corrupt parent chain via the seen-set guard', () => {
    const conversations: BranchedConversation[] = [
      { id: 'a', messages: [], parentId: 'b' },
      { id: 'b', messages: [], parentId: 'a' },
    ];

    const path = getBranchPath(conversations, 'a').map((conversation) => conversation.id);
    expect(path.length).toBeLessThanOrEqual(2);
  });
});

describe('pruneBranch', () => {
  it('removes the target conversation and all descendants', () => {
    const conversations: BranchedConversation[] = [
      { id: 'root', messages: [] },
      { id: 'child', messages: [], parentId: 'root' },
      { id: 'grandchild', messages: [], parentId: 'child' },
      { id: 'sibling', messages: [], parentId: 'root' },
    ];

    const pruned = pruneBranch(conversations, 'child')
      .map((conversation) => conversation.id)
      .sort();
    expect(pruned).toEqual(['root', 'sibling']);
  });

  it('returns the original list when the id is missing', () => {
    const conversations: BranchedConversation[] = [{ id: 'root', messages: [] }];
    const pruned = pruneBranch(conversations, 'missing');
    expect(pruned.map((conversation) => conversation.id)).toEqual(['root']);
  });
});
