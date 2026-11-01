/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { JSONValue } from 'ai';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
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
vi.mock('~/utils/constants', () => ({
  WORK_DIR: '/workspace',
  MODEL_REGEX: /^\[Model: (.*?)\]\n\n/,
  PROVIDER_REGEX: /\[Provider: (.*?)\]\n\n/,
}));

import { AgentLaneSummary, AgentVerificationClaims } from './AgentLaneSummary';
import { AssistantMessage } from './AssistantMessage';
import { Messages } from './Messages.client';
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
    expect(avis.textContent).toContain(
      'gemini-2.5-pro a été sélectionné comme repli ; cela ne confirme aucune sortie de texte',
    );
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

describe('synthetic terminal stream output compatibility', () => {
  afterEach(cleanup);

  const start: JSONValue = { type: 'agentLaneStream', roleId: 'qa', kind: 'start', title: 'QA' };

  function fixture(annotations: JSONValue[], language: 'fr' | 'en' = 'fr') {
    return (
      <I18nextProvider i18n={createI18nInstance(language)}>
        <AssistantMessage
          content="Synthetic stream fixture"
          parts={undefined}
          addToolResult={() => undefined}
          annotations={annotations}
        />
      </I18nextProvider>
    );
  }

  it.each(['fr', 'en'] as const)(
    'preserves done metadata and interruption without claiming applied files (%s)',
    (language) => {
      const copy = getAssistantMessageCopy(language);

      const done: JSONValue = {
        type: 'agentLaneStream',
        roleId: 'qa',
        kind: 'done',
        status: 'failed',
        summary: 'Synthetic original interrupted report',
        outputState: 'interrupted',
        emittedFiles: ['src/synthetic.ts'],
        verificationState: 'not_observed',
      };

      const { rerender } = render(fixture([start, done], language));
      const lane = screen.getByTestId('agent-lane-qa');
      expect(lane.getAttribute('data-state')).toBe('failed');
      expect(within(lane).getByTestId('agent-lane-output').textContent).toContain(
        copy['assistantMessage.lanes.output.interrupted'],
      );
      expect(within(lane).getByTestId('agent-lane-output').textContent).toContain(
        formatAssistantMessageCopy(copy['assistantMessage.lanes.emittedFiles'], { count: 1 }),
      );
      expect(within(lane).getByText('src/synthetic.ts').closest('details')).toBeTruthy();
      rerender(
        fixture([start, { ...(done as object), outputState: 'actions_without_report', status: 'partial' }], language),
      );
      expect(within(lane).getByTestId('agent-lane-output').textContent).toContain(
        copy['assistantMessage.lanes.output.actions_without_report'],
      );
      expect(lane.getAttribute('data-state')).toBe('partial');
    },
  );

  it('uses final results exclusively, including legacy final results without metadata', () => {
    const done: JSONValue = {
      type: 'agentLaneStream',
      roleId: 'qa',
      kind: 'done',
      status: 'failed',
      summary: 'Synthetic stream summary',
      outputState: 'interrupted',
      emittedFiles: ['stream.ts'],
    };
    const final: JSONValue = {
      type: 'agentExecution',
      runId: 'synthetic-final',
      status: 'complete',
      results: [
        {
          roleId: 'qa',
          status: 'complete',
          summary: 'Synthetic final summary',
          outputState: 'report',
          emittedFiles: ['final.ts', 'second.ts'],
        },
      ],
    };

    const { rerender } = render(fixture([start, done, final]));
    expect(screen.getByTestId('agent-lane-qa').getAttribute('data-state')).toBe('complete');
    expect(screen.getByTestId('agent-lane-output').textContent).toContain('Rapport reçu');
    expect(screen.getByTestId('agent-lane-output').textContent).toContain('2 fichiers émis');
    expect(screen.queryByText('stream.ts')).toBeNull();
    rerender(
      fixture([
        start,
        done,
        {
          type: 'agentExecution',
          runId: 'synthetic-legacy',
          status: 'complete',
          results: [{ roleId: 'qa', status: 'complete', summary: 'Legacy final' }],
        },
      ]),
    );
    expect(screen.getByTestId('agent-lane-output').textContent).toBe('');
    expect(screen.getByTestId('agent-lane-apercu').textContent).toBe('Legacy final');
  });

  it('ignores malformed/absent optional stream data and retains stopped fallback', () => {
    const { rerender } = render(
      fixture([
        start,
        { type: 'agentLaneStream', roleId: 'qa', kind: 'done', status: 'partial', summary: 'Synthetic legacy' },
      ]),
    );
    expect(screen.getByTestId('agent-lane-output').textContent).toBe('');
    rerender(
      fixture([
        start,
        {
          type: 'agentLaneStream',
          roleId: 'qa',
          kind: 'done',
          status: 'partial',
          summary: 'Synthetic malformed',
          outputState: { bad: true },
          emittedFiles: ['valid', 5],
          verificationState: 'observed',
        },
      ]),
    );
    expect(screen.getByTestId('agent-lane-output').textContent).toBe('');
    rerender(fixture([start]));
    expect(screen.getByTestId('agent-lane-qa').getAttribute('data-state')).toBe('failed');
    expect(screen.getByTestId('agent-lane-qa').textContent).toContain('arrêté');
    rerender(
      fixture([
        start,
        {
          type: 'agentLaneStream',
          roleId: 'qa',
          kind: 'done',
          outputState: 'interrupted',
          summary: 'Interrupted without legacy status',
        },
      ]),
    );
    expect(screen.getByTestId('agent-lane-qa').getAttribute('data-state')).toBe('failed');
    expect(within(screen.getByTestId('agent-lane-qa')).queryByText('Tâche terminée')).toBeNull();

    for (const outputState of ['empty', 'actions_without_report', 'interrupted']) {
      rerender(
        fixture([
          start,
          {
            type: 'agentLaneStream',
            roleId: 'qa',
            kind: 'done',
            status: 'complete',
            outputState,
            summary: 'Synthetic contradictory legacy status',
          },
        ]),
      );
      expect(within(screen.getByTestId('agent-lane-qa')).queryByText('Tâche terminée')).toBeNull();
      expect(screen.getByTestId('agent-lane-output').textContent).toContain(
        getAssistantMessageCopy('fr')[
          `assistantMessage.lanes.output.${outputState}` as keyof ReturnType<typeof getAssistantMessageCopy>
        ],
      );
    }
  });

  it.each(['fr', 'en'] as const)(
    'keeps failed and partial status explicit alongside a received report (%s)',
    (language) => {
      const copy = getAssistantMessageCopy(language);
      const { rerender } = render(fixture([start], language));

      for (const status of ['partial', 'failed']) {
        rerender(
          fixture(
            [
              start,
              {
                type: 'agentLaneStream',
                roleId: 'qa',
                kind: 'done',
                status,
                outputState: 'report',
                summary: 'Synthetic report despite failure',
              },
            ],
            language,
          ),
        );

        const expected = `${copy[`assistantMessage.status.${status}` as keyof typeof copy]} · ${copy['assistantMessage.lanes.output.report']}`;
        expect(within(screen.getByTestId('agent-lane-qa')).getByText(expected)).toBeTruthy();
        expect(screen.getByTestId('agent-lane-qa').getAttribute('data-state')).toBe(status);
        expect(
          within(screen.getByTestId('agent-lane-qa')).queryByText(copy['assistantMessage.lanes.taskFinished']),
        ).toBeNull();
      }
    },
  );

  it.each(['fr', 'en'] as const)('renders only consolidated string claims as unobserved (%s)', (language) => {
    const copy = getAssistantMessageCopy(language);

    const { rerender } = render(
      <AgentVerificationClaims
        copy={copy}
        consensus={{
          agreedVerificationClaims: ['Wrong location'],
          consolidated: { acceptedVerification: ['Legacy assertion'] },
        }}
      />,
    );
    expect(document.querySelector('details')).toBeNull();
    rerender(
      <AgentVerificationClaims copy={copy} consensus={{ consolidated: { agreedVerificationClaims: ['Valid', {}] } }} />,
    );
    expect(document.querySelector('details')).toBeNull();
    rerender(
      <AgentVerificationClaims
        copy={copy}
        consensus={{ consolidated: { agreedVerificationClaims: ['Synthetic QA statement'], acceptedVerification: [] } }}
      />,
    );
    expect(screen.getByText(copy['assistantMessage.lanes.unverifiedClaims'])).toBeTruthy();
    expect(screen.getByText('Synthetic QA statement').closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByText(copy['assistantMessage.lanes.agreedClaims']));
    expect(screen.getByText('Synthetic QA statement').closest('details')?.open).toBe(true);
  });
});

describe('runtime evidence UI with synthetic receipts', () => {
  afterEach(cleanup);
  it('updates unknown, observed-empty, confirmed and invalidated writes without treating an active run as missing', async () => {
    const writes = await import('~/lib/runtime/agent-lane-writes');
    const { streamingState } = await import('~/lib/stores/streaming');
    writes.reinitialiserConfirmationsEcriture();
    streamingState.set(true);
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content="Synthetic"
          messageId="receipt-ui"
          parts={undefined}
          addToolResult={() => undefined}
          annotations={[
            {
              type: 'agentOrchestration',
              mode: 'parallel-subagents',
              roles: [{ id: 'qa', title: 'QA', responsibility: 'Synthetic' }],
            },
            {
              type: 'agentExecution',
              status: 'complete',
              runId: 'synthetic',
              results: [
                {
                  roleId: 'qa',
                  status: 'complete',
                  files: ['src/App.tsx'],
                  summary: 'Synthetic report',
                  verificationState: 'not_observed',
                },
              ],
            },
          ]}
        />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('agent-write-evidence').textContent).toContain('inconnues');
    act(() => writes.observerEcrituresDeMessage('receipt-ui'));
    expect(screen.getByTestId('agent-write-evidence').textContent).toContain('0 fichier');
    expect(screen.queryByTestId('agent-lanes-shortfall')).toBeNull();
    act(() => streamingState.set(false));
    expect(screen.getByTestId('agent-lanes-shortfall').textContent).toContain('src/App.tsx');
    act(() => writes.confirmerEcritureDeMessage('receipt-ui', 'src/app.tsx', 'lowercase'));
    expect(screen.getByTestId('agent-lanes-shortfall').textContent).toContain('src/App.tsx');
    act(() => writes.confirmerEcritureDeMessage('receipt-ui', 'src/App.tsx', 'exact'));
    expect(screen.queryByTestId('agent-lanes-shortfall')).toBeNull();
    expect(screen.getByTestId('agent-write-evidence').textContent).toContain('2 fichier');
    act(() => writes.invaliderConfirmationDeMessage('receipt-ui', 'src/App.tsx', 'exact'));
    expect(screen.getByTestId('agent-lanes-shortfall')).toBeTruthy();
    act(() => writes.reinitialiserConfirmationsEcriture());
    expect(screen.getByTestId('agent-write-evidence').textContent).toContain('inconnues');
    expect(screen.queryByTestId('agent-lanes-shortfall')).toBeNull();
  });
  it.each(['fr', 'en'])('renders the last observed model without calling it completion (%s)', (language) => {
    render(
      <I18nextProvider i18n={createI18nInstance(language)}>
        <AssistantMessage
          content="Synthetic"
          messageId="m"
          parts={undefined}
          addToolResult={() => undefined}
          annotations={[
            { type: 'modelOutput', provider: 'Synthetic', model: 'first', evidence: 'text-delta' },
            {
              type: 'modelOutput',
              provider: 'Synthetic',
              model: 'continuation',
              evidence: 'text-delta',
              messageId: 'm',
            },
            {
              type: 'modelOutput',
              provider: 'Synthetic',
              model: 'wrong-turn',
              evidence: 'text-delta',
              messageId: 'other',
            },
          ]}
        />
      </I18nextProvider>,
    );

    const text = screen.getByTestId('agent-model-output').textContent;
    expect(text).toContain('continuation');
    expect(text).not.toContain('wrong-turn');
    expect(text).toContain(language === 'fr' ? 'fin de réponse non confirmée' : 'completion is not confirmed');
  });
});

describe('stream terminal evidence', () => {
  afterEach(cleanup);

  it('does not borrow terminal evidence from another message or show it while streaming', () => {
    const terminal = {
      type: 'streamTerminal',
      status: 'complete',
      finishReason: 'stop',
      reason: 'finished',
      segments: 1,
      fileActions: 1,
      openActions: 0,
      openArtifacts: 0,
      messageId: 'old',
    };
    const view = (messageId: string, isStreaming: boolean) => (
      <I18nextProvider i18n={createI18nInstance('en')}>
        <AssistantMessage
          content="Synthetic"
          messageId={messageId}
          isStreaming={isStreaming}
          addToolResult={() => undefined}
          annotations={[terminal]}
        />
      </I18nextProvider>
    );

    const { rerender } = render(view('new', false));
    expect(screen.queryByTestId('agent-stream-terminal')).toBeNull();
    rerender(view('old', true));
    expect(screen.queryByTestId('agent-stream-terminal')).toBeNull();
    rerender(view('old', false));
    expect(screen.getByTestId('agent-stream-terminal').textContent).toContain('Response received');
  });

  it.each(['complete', 'incomplete', 'error'] as const)(
    'renders %s without claiming application validation',
    (status) => {
      render(
        <I18nextProvider i18n={createI18nInstance('en')}>
          <AssistantMessage
            content="Synthetic"
            messageId="terminal-message"
            isStreaming={false}
            addToolResult={() => undefined}
            annotations={[
              { type: 'modelOutput', provider: 'Synthetic', model: 'fixture', evidence: 'text-delta' },
              {
                type: 'streamTerminal',
                status,
                finishReason: status === 'complete' ? 'stop' : status === 'error' ? 'error' : 'length',
                reason: status === 'complete' ? 'finished' : status === 'error' ? 'provider-error' : 'output-limit',
                segments: 1,
                fileActions: 1,
                openActions: 0,
                openArtifacts: 0,
                messageId: 'terminal-message',
              },
            ]}
          />
        </I18nextProvider>,
      );

      const evidence = screen.getByTestId('agent-stream-terminal').textContent;
      expect(evidence).toContain(
        status === 'complete'
          ? 'Response received'
          : status === 'error'
            ? 'The response stopped because of an error'
            : 'The response is incomplete',
      );
      expect(screen.getByTestId('agent-technical-details').textContent).toContain('Application validation is separate');
      expect((screen.getByTestId('agent-technical-details') as HTMLDetailsElement).open).toBe(false);
      expect(screen.getByTestId('agent-model-output').textContent).not.toContain('completion is not confirmed');
    },
  );
});

describe('message-scoped agent evidence', () => {
  afterEach(cleanup);

  it('does not revive an interrupted historical lane during another response', async () => {
    const { streamingState } = await import('~/lib/stores/streaming');

    const annotations = [
      {
        type: 'agentOrchestration',
        mode: 'parallel-subagents',
        reason: 'fixture',
        roles: [{ id: 'backend', title: 'Backend', responsibility: 'Fixture' }],
      },
      { type: 'agentLaneStream', kind: 'start', roleId: 'backend' },
    ];

    const messages = [
      { id: 'old', role: 'assistant' as const, content: 'Old interrupted response', annotations },
      { id: 'next', role: 'user' as const, content: 'Continue' },
      { id: 'current', role: 'assistant' as const, content: 'Current response', annotations },
      { id: 'internal', role: 'system' as const, content: 'Hidden metadata' },
    ];
    streamingState.set(true);

    try {
      const i18n = createI18nInstance('fr');

      const view = (active: boolean) => (
        <MemoryRouter>
          <I18nextProvider i18n={i18n}>
            <Messages messages={messages} isStreaming={active} addToolResult={() => undefined} />
          </I18nextProvider>
        </MemoryRouter>
      );

      const { container, rerender } = render(view(true));
      expect(
        container.querySelector('#chat-message-old [data-testid="agent-lane-backend"]')?.getAttribute('data-state'),
      ).toBe('failed');
      expect(
        container.querySelector('#chat-message-current [data-testid="agent-lane-backend"]')?.getAttribute('data-state'),
      ).toBe('running');

      const pending = getAssistantMessageCopy('fr')['assistantMessage.lanes.writePending'];
      expect(
        container.querySelector('#chat-message-old [data-testid="agent-write-evidence"]')?.textContent,
      ).not.toContain(pending);
      expect(
        container.querySelector('#chat-message-current [data-testid="agent-write-evidence"]')?.textContent,
      ).toContain(pending);
      rerender(view(false));
      expect(
        container.querySelector('#chat-message-current [data-testid="agent-lane-backend"]')?.getAttribute('data-state'),
      ).toBe('failed');
    } finally {
      act(() => streamingState.set(false));
    }
  });

  it('renders a standalone terminal lane error even without prose or orchestration', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content=""
          messageId="lane-error"
          parts={[]}
          annotations={[
            {
              type: 'agentLaneStream',
              kind: 'done',
              roleId: 'backend',
              status: 'failed',
              summary: 'Synthetic tool failure',
            },
          ]}
          addToolResult={() => undefined}
        />
      </I18nextProvider>,
    );
    expect(screen.getByTestId('agent-lane-backend').getAttribute('data-state')).toBe('failed');
    expect(screen.getByTestId('agent-lane-apercu').textContent).toBe('Synthetic tool failure');
    expect(screen.queryByText(getAssistantMessageCopy('fr')['assistantMessage.lanes.finalizing'])).toBeNull();
  });

  it('does not create an empty message shell from badges suppressed in the IDE', () => {
    const { container } = render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content=""
          messageId="metadata-only"
          parts={[]}
          masquerLesPuces
          annotations={[{ type: 'agentModeRouting', mode: 'build' }]}
          addToolResult={() => undefined}
        />
      </I18nextProvider>,
    );
    expect(container.querySelector('.bolt-assistant-message')).toBeNull();
  });
});
