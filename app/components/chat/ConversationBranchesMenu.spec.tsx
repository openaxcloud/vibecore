/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConversationBranchesMenu } from './ConversationBranchesMenu';
import { createI18nInstance } from '~/lib/i18n/runtime';

/*
 * Mock the hook the menu reads. We don't care about the persistence
 * layer here — we just want to drive the component with deterministic
 * branch data and verify the menu render + interactions.
 */
const switchTo = vi.fn().mockResolvedValue(true);
const rename = vi.fn().mockResolvedValue(undefined);
const remove = vi.fn().mockResolvedValue(undefined);

let hookReturn: {
  conversations: Array<{ id: string; title?: string; messages: unknown[]; parentId?: string }>;
  tree: Array<{
    conversation: { id: string; title?: string; messages: unknown[]; parentId?: string };
    children: unknown[];
  }>;
} = { conversations: [], tree: [] };

vi.mock('~/lib/hooks/useProjectChatBranches', () => ({
  useProjectChatBranches: () => ({
    conversations: hookReturn.conversations,
    tree: hookReturn.tree,
    fork: vi.fn(),
    switchTo,
    rename,
    remove,
  }),
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function setBranches(items: Array<{ id: string; title?: string; messages?: unknown[]; parentId?: string }>) {
  const normalised = items.map((item) => ({ ...item, messages: item.messages ?? [] }));
  hookReturn = {
    conversations: normalised,

    // Flat tree — depth 0, no children, sufficient for unit tests of the row component.
    tree: normalised
      .filter((conversation) => !conversation.parentId)
      .map((conversation) => ({ conversation, children: [] })),
  };
}

function renderMenu(element: ReactElement, language: 'en' | 'fr' = 'en') {
  return render(<I18nextProvider i18n={createI18nInstance(language)}>{element}</I18nextProvider>);
}

describe('<ConversationBranchesMenu />', () => {
  beforeEach(() => {
    switchTo.mockClear();
    rename.mockClear();
    remove.mockClear();
    hookReturn = { conversations: [], tree: [] };
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when there are no conversations', () => {
    setBranches([]);

    const { container } = renderMenu(<ConversationBranchesMenu projectId="p-1" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the trigger with the conversation count', () => {
    setBranches([
      { id: 'project:p-1', title: 'Current', messages: [{}, {}] },
      { id: 'fork-1', title: 'Old branch' },
    ]);

    renderMenu(<ConversationBranchesMenu projectId="p-1" />);

    const trigger = screen.getByRole('button', { name: /Conversation branches \(2\)/ });
    expect(trigger).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the popover and lists branch rows on click', () => {
    setBranches([
      { id: 'project:p-1', title: 'Current', messages: [{}, {}] },
      { id: 'fork-1', title: 'Old branch' },
    ]);

    renderMenu(<ConversationBranchesMenu projectId="p-1" />);

    const trigger = screen.getByRole('button', { name: /Conversation branches/ });
    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Current')).toBeTruthy();
    expect(screen.getByText('Old branch')).toBeTruthy();
  });

  it('calls switchTo when the user picks a branch', () => {
    setBranches([{ id: 'fork-1', title: 'Old branch' }]);

    renderMenu(<ConversationBranchesMenu projectId="p-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Conversation branches/ }));

    /*
     * The branch switch button's accessible name comes from its content
     * (label span + count). Find by the title attribute via getByTitle.
     */
    fireEvent.click(screen.getByTitle('Switch to Old branch'));

    expect(switchTo).toHaveBeenCalledWith('fork-1');
  });

  it('marks the active branch with data-active', () => {
    setBranches([
      { id: 'project:p-1', title: 'Live thread' },
      { id: 'fork-1', title: 'Archived' },
    ]);

    renderMenu(<ConversationBranchesMenu projectId="p-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Conversation branches/ }));

    const liveRow = screen.getByText('Live thread').closest('li');
    const archivedRow = screen.getByText('Archived').closest('li');
    expect(liveRow?.getAttribute('data-active')).toBe('true');
    expect(archivedRow?.getAttribute('data-active')).toBe('false');
  });

  it('renders French controls while preserving user-authored branch titles', () => {
    setBranches([{ id: 'fork-1', title: 'Customer checkout branch' }]);

    renderMenu(<ConversationBranchesMenu projectId="p-1" />, 'fr');
    fireEvent.click(screen.getByRole('button', { name: 'Branches de conversation (1)' }));

    expect(screen.getByTitle('Basculer vers Customer checkout branch')).toBeTruthy();
    expect(screen.getByTitle('Renommer la branche')).toBeTruthy();
    expect(screen.getByTitle('Supprimer la branche (et ses descendantes)')).toBeTruthy();
    expect(document.body.textContent).toContain('Customer checkout branch');
    expect(document.body.textContent).not.toContain('Browse conversation branches');
  });
});
