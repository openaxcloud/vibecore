/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('react-toastify', () => ({ toast: toastMocks }));
vi.mock('./Markdown', () => ({ Markdown: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('./MessagePatchReview', () => ({ MessagePatchReview: () => null }));
vi.mock('./PlanChecklist', () => ({ PlanChecklistView: () => null }));
vi.mock('./ThoughtBox', () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
vi.mock('./ToolInvocations', () => ({ ToolInvocations: () => null }));
vi.mock('./connector-cards/ConnectionFailedNote', () => ({ ConnectionFailedNote: () => null }));
vi.mock('./connector-cards/ConnectionRequestCard', () => ({ ConnectionRequestCard: () => null }));
vi.mock('./connector-cards/ConnectionResolvedNote', () => ({ ConnectionResolvedNote: () => null }));
vi.mock('./connector-cards/ReconnectionRequiredBanner', () => ({ ReconnectionRequiredBanner: () => null }));
vi.mock('./connector-cards/SecretRequestCard', () => ({ SecretRequestCard: () => null }));
vi.mock('~/components/ui/Popover', () => ({
  default: ({ trigger, children }: { trigger: ReactNode; children: ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
}));
vi.mock('~/components/ui/Tooltip', () => ({
  default: ({ tooltip, children }: { tooltip: ReactNode; children: ReactNode }) => (
    <div data-tooltip={String(tooltip)}>{children}</div>
  ),
}));
vi.mock('~/lib/persistence/useChatHistory', async () => {
  const { atom } = await import('nanostores');

  return { chatId: atom<string | undefined>(undefined) };
});
vi.mock('~/lib/stores/streaming', async () => {
  const { atom } = await import('nanostores');

  return { streamingState: atom(false) };
});
vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    currentView: { get: () => 'code', set: vi.fn() },
    setSelectedFile: vi.fn(),
  },
}));
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({ warn: vi.fn() }),
}));
vi.mock('~/utils/constants', () => ({ WORK_DIR: '/workspace' }));

import { AssistantMessage } from './AssistantMessage';
import {
  formatAssistantCost,
  formatAssistantDuration,
  formatAssistantMessageCopy,
  formatAssistantTasksAgents,
  getAssistantMessageCopy,
  localizeAssistantEnum,
  selectAssistantMessagePlural,
} from '~/lib/i18n/catalogs/assistant-message';
import { createI18nInstance } from '~/lib/i18n/runtime';

describe('AssistantMessage i18n', () => {
  afterEach(() => {
    cleanup();
    toastMocks.error.mockReset();
    toastMocks.success.mockReset();
  });

  it('supports French plurals, interpolation, enum labels, and locale-aware metrics', () => {
    const copy = getAssistantMessageCopy('fr-FR');

    expect(
      formatAssistantMessageCopy(selectAssistantMessagePlural(copy, 'assistantMessage.context.memoriesUsed', 2), {
        count: 2,
      }),
    ).toBe('2 souvenirs persistants utilisés pour cette réponse');
    expect(formatAssistantTasksAgents(copy, 1, 2, 'fr')).toBe('1 tâche · 2 agents');
    expect(localizeAssistantEnum(copy, 'outcome', 'ACCEPTED')).toBe('Accepté');
    expect(localizeAssistantEnum(copy, 'role', 'architect')).toBe('Architecte');
    expect(formatAssistantDuration(1250, 'fr')).toBe('1,3 s');
    expect(formatAssistantCost(1.5, 'fr')).toBe('1,50 $US');
    expect(getAssistantMessageCopy('de')['assistantMessage.context.summary']).toBe('Summary');
  });

  it('renders the assistant chrome and message actions in French without translating user content', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content="User-owned content"
          messageId="message-1"
          parts={undefined}
          addToolResult={() => undefined}
        />
      </I18nextProvider>,
    );

    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByText('User-owned content')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Actions du message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copier le message' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Marquer la réponse comme utile' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Message actions' })).toBeNull();
  });

  /*
   * AGENT-MSG-001 — le déclencheur de contexte n'était qu'une icône « i » posée
   * seule sur sa ligne : son intitulé n'existait que pour les lecteurs d'écran,
   * c'est-à-dire pour ceux qui n'ont justement pas besoin de deviner. Le libellé
   * est désormais RENDU, pas seulement annoncé.
   */
  it('affiche un libellé visible sur le déclencheur de contexte, pas seulement un aria-label', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content="Contenu"
          messageId="message-contexte"
          parts={undefined}
          addToolResult={() => undefined}
          annotations={
            [{ type: 'agentMemory', memories: [{ id: 'm1', content: 'note', kind: 'preference' }] }] as never
          }
        />
      </I18nextProvider>,
    );

    const declencheur = screen.getByRole('button', { name: 'Afficher le contexte du message de l’agent' });

    expect(declencheur.textContent).toContain('Contexte');
  });

  it('uses a safe French clipboard error instead of exposing technical details', async () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage content="Contenu" parts={undefined} addToolResult={() => undefined} />
      </I18nextProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copier le message' }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Impossible de copier le message.'));
    expect(toastMocks.error).not.toHaveBeenCalledWith(expect.stringContaining('Clipboard API'));
  });
});
