/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

import { AgentLaneSummary } from './AgentLaneSummary';
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

describe('parallel agents — synthetic presentation fixtures', () => {
  afterEach(cleanup);

  it.each(['fr', 'en'] as const)(
    'keeps partial consensus separate from completed QA and preserves original reports (%s)',
    (language) => {
      const copy = getAssistantMessageCopy(language);
      const raw = JSON.stringify({ architecture_notes: 'Synthetic architecture', summary: 'Synthetic useful summary' });
      render(
        <I18nextProvider i18n={createI18nInstance(language)}>
          <AssistantMessage
            content="Synthetic fixture"
            parts={undefined}
            addToolResult={() => undefined}
            annotations={[
              {
                type: 'agentOrchestration',
                mode: 'parallel-subagents',
                reason: 'synthetic fixture',
                roles: [
                  { id: 'architect', title: 'Architect', responsibility: 'Architecture' },
                  { id: 'backend', title: 'Backend', responsibility: 'Backend' },
                  { id: 'qa', title: 'QA', responsibility: 'QA' },
                ],
              },
              {
                type: 'agentExecution',
                runId: 'synthetic-only',
                status: 'partial',
                results: [
                  { roleId: 'architect', status: 'complete', summary: raw },
                  { roleId: 'backend', status: 'failed', summary: 'The agent returned an empty response.' },
                  { roleId: 'qa', status: 'complete', summary: 'Synthetic checks finished' },
                ],
                consensus: {
                  algorithm: 'QUORUM',
                  outcome: 'PARTIAL',
                  agreementScore: 0.25,
                  threshold: 0.75,
                  rounds: 1,
                  durationMs: 1,
                  claimVotes: [
                    {
                      type: 'verification',
                      claim: 'Synthetic test declaration',
                      supporters: ['qa'],
                      dissenters: [],
                      agreementRatio: 0.25,
                      decision: 'inconclusive',
                    },
                  ],
                  conflicts: [],
                },
              },
            ]}
          />
        </I18nextProvider>,
      );

      const qa = screen.getByTestId('agent-lane-qa');
      expect(qa.textContent).toContain(copy['assistantMessage.lanes.taskFinished']);
      expect(qa.getAttribute('data-state')).toBe('complete');
      expect(screen.getByText(copy['assistantMessage.lanes.notValidated'])).toBeTruthy();
      expect(screen.getByText(copy['assistantMessage.lanes.unverifiedClaims'])).toBeTruthy();
      expect(screen.getByText('Synthetic test declaration')).toBeTruthy();
      expect(screen.getByTestId('agent-lanes-panel').textContent).toContain('25');
      expect(screen.getByText(copy['assistantMessage.lanes.emptyResponse'])).toBeTruthy();
      expect(screen.getByText('Synthetic useful summary')).toBeTruthy();

      const original = within(screen.getByTestId('agent-lane-architect')).getByText(raw);
      const disclosure = original.closest('details')!;
      expect(disclosure.open).toBe(false);
      fireEvent.click(disclosure.querySelector('summary')!);
      expect(disclosure.open).toBe(true);
      expect(original.textContent).toBe(raw);
      expect(
        within(screen.getByTestId('agent-lane-backend'))
          .getByText('The agent returned an empty response.')
          .closest('details'),
      ).toBeTruthy();
    },
  );

  it('keeps interrupted lanes stopped without changing their terminal state', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content="Synthetic stopped fixture"
          parts={undefined}
          addToolResult={() => undefined}
          annotations={[{ type: 'agentLaneStream', roleId: 'qa', kind: 'start', title: 'QA' }]}
        />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('agent-lane-qa').getAttribute('data-state')).toBe('failed');
    expect(screen.getByTestId('agent-lane-qa').textContent).toContain('arrêté');
    expect(screen.queryByText('Tâche terminée')).toBeNull();
  });
});

describe('synthetic agent report details', () => {
  afterEach(cleanup);

  it.each(['fr', 'en'] as const)('retains incomplete JSON, unknown errors and long text (%s)', (language) => {
    const copy = getAssistantMessageCopy(language);
    const incomplete = '{"architecture_notes":"Synthetic unfinished';
    const { rerender } = render(<AgentLaneSummary value={incomplete} copy={copy} />);
    expect(screen.getByTestId('agent-lane-apercu').textContent).toBe(copy['assistantMessage.lanes.structured']);
    expect(screen.getByText(incomplete).closest('details')?.open).toBe(false);

    const longError = 'Synthetic unknown provider error. '.repeat(20);
    rerender(<AgentLaneSummary value={longError} copy={copy} />);
    expect(screen.getByTestId('agent-lane-apercu').textContent).toBe(longError);
    expect(document.querySelector('details pre')?.textContent).toBe(longError);
    rerender(<AgentLaneSummary value="Synthetic short unknown error" copy={copy} />);
    expect(screen.getByTestId('agent-lane-apercu').textContent).toBe('Synthetic short unknown error');
    expect(document.querySelector('details pre')?.textContent).toBe('Synthetic short unknown error');
    expect(document.querySelector('details')?.open).toBe(false);
  });
});

describe('synthetic optional lane output contract', () => {
  afterEach(cleanup);

  it.each(['fr', 'en'] as const)(
    'reads supported states and preserves emitted-not-applied metadata (%s)',
    (language) => {
      const copy = getAssistantMessageCopy(language);
      const { rerender } = render(<AgentLaneSummary value="Synthetic report" copy={copy} />);
      expect(screen.getByTestId('agent-lane-output').textContent).toBe('');

      for (const outputState of ['empty', 'actions_without_report', 'report', 'invalid_report', 'interrupted']) {
        rerender(
          <AgentLaneSummary
            value="Synthetic original"
            copy={copy}
            result={{
              outputState,
              emittedFiles: ['src/synthetic.ts'],
              verificationState: 'not_observed',
              verification: ['Model says tests passed'],
            }}
          />,
        );
        expect(screen.getByTestId('agent-lane-output').textContent).toContain(
          copy[`assistantMessage.lanes.output.${outputState}` as keyof typeof copy],
        );
        expect(screen.getByTestId('agent-lane-output').textContent).toContain(
          formatAssistantMessageCopy(copy['assistantMessage.lanes.emittedFiles'], { count: 1 }),
        );
        expect(document.querySelector('details pre')?.textContent).toBe('Synthetic original');
        expect(screen.getByText('src/synthetic.ts').closest('details')).toBeTruthy();
        expect(screen.queryByText('Model says tests passed')).toBeNull();
      }
      rerender(
        <AgentLaneSummary
          value="Synthetic"
          copy={copy}
          result={{ outputState: { bad: true }, emittedFiles: ['valid', 3], verificationState: 'observed' }}
        />,
      );
      expect(screen.getByTestId('agent-lane-output').textContent).toBe('');
    },
  );
});
