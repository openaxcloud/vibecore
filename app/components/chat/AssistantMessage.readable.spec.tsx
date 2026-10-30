/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { JSONValue } from 'ai';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('react-toastify', () => ({ toast: toastMocks }));
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
  createScopedLogger: () => ({ warn: vi.fn(), trace: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));
vi.mock('~/utils/constants', () => ({
  WORK_DIR: '/workspace',
  MODEL_REGEX: /^\[Model: (.*?)\]\n\n/,
  PROVIDER_REGEX: /\[Provider: (.*?)\]\n\n/,
}));

vi.mock('./Artifact', () => ({
  Artifact: () => <div data-testid="parsed-artifact" />,
  openArtifactInWorkbench: vi.fn(),
}));
import { AssistantMessage, type AssistantMessageProps } from './AssistantMessage';
import { createI18nInstance } from '~/lib/i18n/runtime';

const rawFile =
  '<boltArtifact id="aster" title="Site Aster"><boltAction type="file" filePath="src/App.tsx">import React from "react";\n' +
  '<main>Aster synthetic portfolio</main>\n'.repeat(35);

const completeFile = rawFile + '</boltAction></boltArtifact>';

const terminalError: JSONValue = {
  type: 'streamTerminal',
  status: 'error',
  finishReason: 'error',
  reason: 'provider-error',
  segments: 1,
  fileActions: 1,
  openActions: 0,
  openArtifacts: 0,
};

function view(props: Partial<AssistantMessageProps> = {}) {
  return (
    <MemoryRouter>
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <AssistantMessage
          content=""
          parts={undefined}
          messageId="aster"
          addToolResult={() => undefined}
          isStreaming={false}
          {...props}
        />
      </I18nextProvider>
    </MemoryRouter>
  );
}
afterEach(cleanup);
describe('assistant readable conversation with real Markdown (synthetic Aster fixtures)', () => {
  it.each([true, false])('separates prose and escaped raw file source, parts-only=%s', (partsOnly) => {
    const body =
      'Je prépare votre site Aster.\n\n' + completeFile + '\n\nLe formulaire nécessite encore une vérification.';

    const { container } = render(view(partsOnly ? { parts: [{ type: 'text', text: body }] } : { content: body }));
    const details = screen.getByTestId('agent-technical-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(container.querySelectorAll('details[data-testid="agent-technical-details"]')).toHaveLength(1);
    expect(screen.getByText('Je prépare votre site Aster.').closest('details')).toBeNull();
    expect(screen.getByText('Le formulaire nécessite encore une vérification.').closest('details')).toBeNull();
    expect(details.textContent).toContain('<main>Aster synthetic portfolio</main>');
    expect(container.querySelector('boltartifact')).toBeNull();
    expect(container.querySelector('main')).toBeNull();
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
  });
  it('keeps technical disclosure closed through chunks and keeps the chosen open state until message identity changes', () => {
    const { rerender } = render(view({ content: rawFile.slice(0, 70), isStreaming: true }));

    let details = screen.getByTestId('agent-technical-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    rerender(view({ content: rawFile, isStreaming: true }));
    expect(screen.getByTestId('agent-technical-details')).toBe(details);
    expect(details.open).toBe(false);
    fireEvent.click(details.querySelector('summary')!);
    rerender(view({ content: completeFile, isStreaming: false }));
    expect(details.open).toBe(true);
    rerender(view({ messageId: 'different', content: completeFile }));
    details = screen.getByTestId('agent-technical-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });
  it('shows an error-only terminal message outside its technical details', () => {
    render(view({ annotations: [terminalError] }));
    expect(screen.getByTestId('agent-stream-terminal').closest('details')).toBeNull();
    expect(screen.getByTestId('agent-stream-terminal').textContent).toContain('erreur');
  });
  it('shows unconfirmed truncated historical activity outside its collapsed details', () => {
    render(view({ content: rawFile }));
    expect(screen.getByTestId('agent-attention').closest('details')).toBeNull();
    expect((screen.getByTestId('agent-technical-details') as HTMLDetailsElement).open).toBe(false);
  });
  it('never reintroduces raw parts when the parser intentionally produced empty prose', () => {
    const { container } = render(
      view({ content: '', contentIsParsed: true, parts: [{ type: 'text', text: rawFile }], isStreaming: true }),
    );
    expect(container.textContent).not.toContain('import React');
  });
  it.each(['discuss', 'no-files'] as const)('preserves explicitly requested fenced code in %s', async (mode) => {
    const { container } = render(
      view({
        content: 'src/Example.tsx:\n\n```tsx\nexport const example = 42;\n```',
        chatMode: mode === 'discuss' ? 'discuss' : 'build',
        annotations: mode === 'no-files' ? [{ type: 'consigneSansFichier' }] : undefined,
      }),
    );
    await waitFor(() => expect(container.textContent).toContain('export const example = 42;'));
    expect(container.querySelector('pre')?.closest('details')).toBeNull();
  });
  it('folds the full build-mode code payload without a filename and preserves surrounding prose', () => {
    const code = 'import React from "react";\n' + 'const item = "aster";\n'.repeat(40);
    render(
      view({
        content: 'Voici les changements proposés.\n\n```tsx\n' + code + '```\n\nJe dois encore vérifier le résultat.',
        chatMode: 'build',
      }),
    );

    const details = screen.getByTestId('agent-technical-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain(code.trim());
    expect(screen.getByText('Je dois encore vérifier le résultat.').closest('details')).toBeNull();
  });
  it('groups agent progress in one closed disclosure while keeping a failed activity visible', () => {
    render(
      view({
        content: 'Je prépare votre site.',
        annotations: [
          { type: 'agentPlan', tasks: [{ roleId: 'backend', title: 'Préparer les données' }], needsApproval: false },
          { type: 'agentLaneStream', kind: 'start', roleId: 'backend', title: 'Données' },
          { type: 'agentLaneStream', kind: 'done', roleId: 'backend', status: 'failed', summary: 'La tâche a échoué.' },
        ],
      }),
    );

    const details = screen.getByTestId('agent-technical-details') as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(screen.getByTestId('agent-lanes-panel').closest('details')).toBe(details);
    expect(screen.getByTestId('agent-attention').closest('details')).toBeNull();
  });
  it('renders unparsed historical JSX literally rather than interpreting it as HTML', () => {
    const source = 'Exemple : <section data-aster="raw">Texte historique</section>';
    const { container } = render(view({ parts: [{ type: 'text', text: source }] }));
    expect(container.querySelector('[data-aster]')).toBeNull();
    expect(container.textContent).toContain(source);
  });
  it('keeps an explicitly requested parser-placeholder example as code even with parsed content', async () => {
    const source = '<div class="__boltArtifact__" data-message-id="sample" data-artifact-id="sample"></div>';

    const { container } = render(
      view({
        content: '```html\n' + source + '\n```',
        contentIsParsed: true,
        chatMode: 'build',
        annotations: [{ type: 'consigneSansFichier' }],
      }),
    );
    await waitFor(() => expect(container.textContent).toContain(source));
    expect(screen.queryByTestId('parsed-artifact')).toBeNull();
    expect(container.querySelector('pre')?.closest('details')).toBeNull();
  });
  it('keeps required plan approval visible and functional outside technical details', () => {
    const listener = vi.fn();
    window.addEventListener('vibecore:plan-approved', listener);

    try {
      render(
        view({
          annotations: [
            { type: 'agentPlan', tasks: [{ roleId: 'backend', title: 'Préparer les données' }], needsApproval: true },
          ],
        }),
      );

      const approve = screen.getByRole('button', { name: 'Approuver et créer' });
      expect(approve.closest('details')).toBeNull();
      fireEvent.click(approve);
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('vibecore:plan-approved', listener);
    }
  });
});
