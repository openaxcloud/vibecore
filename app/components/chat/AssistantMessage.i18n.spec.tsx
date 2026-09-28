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

  it('DIT la bascule de fournisseur — plus de substitution silencieuse (2026-09-28)', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content="Réponse"
          messageId="message-bascule"
          parts={undefined}
          annotations={[
            {
              type: 'basculeFournisseur',
              depuis: { provider: 'Anthropic', model: 'claude-opus-5' },
              vers: { provider: 'Google', model: 'gemini-2.5-pro' },
              motif: 'credit',
            },
          ]}
          addToolResult={() => undefined}
        />
      </I18nextProvider>,
    );

    const avis = screen.getByTestId('agent-bascule-fournisseur');
    expect(avis.getAttribute('role')).toBe('status');
    expect(avis.textContent).toContain('claude-opus-5 était indisponible (crédit du fournisseur épuisé)');
    expect(avis.textContent).toContain('produite par gemini-2.5-pro, le repli déclaré par la carte de routage');
  });

  it('les cartes des sous-agents RÉSERVENT trois lignes, quel que soit leur texte (2026-09-28)', () => {
    /*
     * Mesuré en production à 390 px : l'aperçu passait d'une à trois lignes pendant
     * le flux, et le fil sautait (~750 px en 0,9 s, retours de 40 px). La hauteur
     * doit être FIXE — la même classe pour un texte court et un texte long.
     */
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content="Réponse"
          messageId="message-lanes"
          parts={undefined}
          annotations={[
            {
              type: 'agentOrchestration',
              mode: 'parallel-subagents',
              reason: 'test',
              roles: [
                { id: 'architect', title: 'Architecte', responsibility: 'Court.' },
                { id: 'qa', title: 'QA', responsibility: 'Un texte bien plus long. '.repeat(20) },
              ],
            },
          ]}
          addToolResult={() => undefined}
        />
      </I18nextProvider>,
    );

    const apercus = screen.getAllByTestId('agent-lane-apercu');
    expect(apercus, 'une carte par rôle').toHaveLength(2);

    for (const apercu of apercus) {
      const classes = apercu.className.split(/\s+/);
      expect(classes).toContain('h-12');
      expect(classes).toContain('leading-4');
      expect(classes).toContain('line-clamp-3');

      // Une hauteur MINIMALE laisserait encore grandir la carte.
      expect(classes.some((c) => c.startsWith('min-h-') || c.startsWith('max-h-'))).toBe(false);
    }

    expect(apercus[0].className).toBe(apercus[1].className);
  });

  it('TÉMOIN — sans bascule, aucun avis', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage content="Réponse" messageId="m-sans" parts={undefined} addToolResult={() => undefined} />
      </I18nextProvider>,
    );

    expect(screen.queryByTestId('agent-bascule-fournisseur')).toBeNull();
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

    /*
     * Les actions ne sont plus posées en permanence sous le message : elles
     * vivent dans le menu contextuel, ouvert par un appui long au doigt ou un
     * clic droit à la souris. C'est la demande d'Avi, captures à l'appui —
     * « pourquoi perdre tant de place dans les bubbles ».
     *
     * Ce test n'est PAS allégé : il vérifie toujours les mêmes libellés
     * français, à la même exigence. Seul le chemin pour les atteindre change.
     */
    expect(screen.queryByRole('group', { name: 'Actions du message' }), 'aucune rangée permanente').toBeNull();

    fireEvent.contextMenu(document.querySelector('[data-menu-contextuel="true"]')!, { clientX: 20, clientY: 20 });

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

    /* Les actions vivent désormais dans le menu contextuel : on l'ouvre d'abord. */
    fireEvent.contextMenu(document.querySelector('[data-menu-contextuel="true"]')!, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole('button', { name: 'Copier le message' }));

    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('Impossible de copier le message.'));
    expect(toastMocks.error).not.toHaveBeenCalledWith(expect.stringContaining('Clipboard API'));
  });
});
