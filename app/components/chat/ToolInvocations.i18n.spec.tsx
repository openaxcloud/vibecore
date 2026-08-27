/** @vitest-environment jsdom */

import type { ToolInvocationUIPart } from '@ai-sdk/ui-utils';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toolConstants = vi.hoisted(() => ({
  TOOL_EXECUTION_APPROVAL: {
    APPROVE: 'Yes, approved.',
    REJECT: 'No, rejected.',
  } as const,
  TOOL_NO_EXECUTE_FUNCTION: 'Error: No execute function found on tool',
  TOOL_EXECUTION_DENIED: 'Error: User denied access to tool execution',
  TOOL_EXECUTION_ERROR: 'Error: An error occured while calling tool',
}));

vi.mock('~/utils/constants', () => toolConstants);
vi.mock('~/lib/stores/theme', () => ({ themeStore: {} }));
vi.mock('@nanostores/react', () => ({ useStore: () => 'dark' }));
vi.mock('~/utils/logger', () => ({ logger: { error: vi.fn() } }));

vi.mock('shiki', () => ({
  createHighlighter: async () => ({
    codeToHtml: (code: string) => {
      const escaped = code
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

      return `<pre><code>${escaped}</code></pre>`;
    },
  }),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  const motionKeys = ['animate', 'exit', 'initial', 'layout', 'transition', 'variants', 'whileHover', 'whileTap'];

  function createMotionElement(tag: 'div' | 'li') {
    return (props: Record<string, unknown>) => {
      const domProps = { ...props };

      for (const key of motionKeys) {
        delete domProps[key];
      }

      return React.createElement(tag, domProps);
    };
  }

  return {
    AnimatePresence: ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children),
    cubicBezier: () => (value: number) => value,
    motion: {
      div: createMotionElement('div'),
      li: createMotionElement('li'),
    },
    useReducedMotion: () => true,
  };
});

import { ToolInvocations, classifyToolInvocationSafeResult, serializeToolInvocationValue } from './ToolInvocations';
import {
  formatToolInvocationsProgress,
  getToolInvocationSafeResultCopy,
  getToolInvocationsCopy,
  toolInvocationsEn,
  toolInvocationsFr,
} from '~/lib/i18n/catalogs/tool-invocations';
import type { ToolCallAnnotation } from '~/types/context';

function createTestI18n(language: 'en' | 'fr' | 'es') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

function renderWithLanguage(language: 'en' | 'fr' | 'es', node: ReactNode) {
  const i18n = createTestI18n(language);

  return {
    i18n,
    ...render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>),
  };
}

function toolCall(toolCallId: string, toolName: string, args: Record<string, unknown> = {}): ToolInvocationUIPart {
  return {
    type: 'tool-invocation',
    toolInvocation: {
      state: 'call',
      toolCallId,
      toolName,
      args,
    },
  };
}

function toolResult(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): ToolInvocationUIPart {
  return {
    type: 'tool-invocation',
    toolInvocation: {
      state: 'result',
      toolCallId,
      toolName,
      args,
      result,
    },
  };
}

function annotation(
  toolCallId: string,
  serverName: string,
  toolName: string,
  toolDescription: string,
): ToolCallAnnotation {
  return {
    type: 'toolCall',
    toolCallId,
    serverName,
    toolName,
    toolDescription,
  };
}

afterEach(cleanup);

describe('tool invocation catalog', () => {
  it('keeps the EN and FR catalogs aligned and falls back to English', () => {
    expect(Object.keys(toolInvocationsFr)).toEqual(Object.keys(toolInvocationsEn));
    expect(getToolInvocationsCopy('fr-FR')['toolInvocations.summary.label']).toBe('Appels d’outils');
    expect(getToolInvocationsCopy('es-ES')['toolInvocations.summary.label']).toBe('Tool calls');
  });

  it('formats localized counts and percentages', () => {
    expect(formatToolInvocationsProgress(1, 2, 'en')).toBe('Progress: 1/2 · 50%');
    expect(formatToolInvocationsProgress(1, 2, 'fr')).toBe('Progression : 1/2 · 50 %');
    expect(formatToolInvocationsProgress(1_200, 2_000, 'fr')).toBe('Progression : 1 200/2 000 · 60 %');
  });

  it('maps only application-owned sentinels to localized safe UI copy', () => {
    expect(classifyToolInvocationSafeResult(toolConstants.TOOL_EXECUTION_APPROVAL.APPROVE)).toBe('approved');
    expect(classifyToolInvocationSafeResult(toolConstants.TOOL_EXECUTION_APPROVAL.REJECT)).toBe('denied');
    expect(classifyToolInvocationSafeResult(toolConstants.TOOL_EXECUTION_DENIED)).toBe('denied');
    expect(classifyToolInvocationSafeResult(toolConstants.TOOL_NO_EXECUTE_FUNCTION)).toBe('unavailable');
    expect(classifyToolInvocationSafeResult(toolConstants.TOOL_EXECUTION_ERROR)).toBe('failed');
    expect(classifyToolInvocationSafeResult('Error: stderr from the user tool')).toBeNull();
    expect(getToolInvocationSafeResultCopy('failed', 'fr')).toEqual({
      title: 'Échec de l’exécution',
      body: 'Impossible d’exécuter l’outil. Vérifiez ses paramètres, puis réessayez.',
    });
  });

  it('serializes technical values without translating or rewriting their content', () => {
    expect(
      serializeToolInvocationValue({
        variable: 'OPENAI_API_KEY',
        path: '/workspace/src/App.tsx',
        error: 'TypeError: ENOENT',
      }),
    ).toBe('{"variable":"OPENAI_API_KEY","path":"/workspace/src/App.tsx","error":"TypeError: ENOENT"}');
  });
});

describe('<ToolInvocations /> i18n', () => {
  it('localizes pending-call controls while preserving tool metadata and approval values', () => {
    const addToolResult = vi.fn();
    const toolName = 'filesystem.read_file';
    const description = 'Read exactly /workspace/src/App.tsx';

    renderWithLanguage(
      'fr',
      <ToolInvocations
        toolInvocations={[toolCall('call-1', toolName, { path: '/workspace/src/App.tsx' })]}
        toolCallAnnotations={[annotation('call-1', 'mcp.filesystem.prod', toolName, description)]}
        addToolResult={addToolResult}
      />,
    );

    const disclosure = screen.getByRole('button', { name: /Afficher le détail des appels d’outils/u });
    expect(disclosure.textContent).toContain('Appels d’outils');
    expect(disclosure.className).toContain('min-h-[44px]');

    fireEvent.click(disclosure);

    expect(screen.getByRole('region', { name: 'Appels d’outils en attente d’autorisation' })).toBeTruthy();
    expect(screen.getByText(toolName).textContent).toBe(toolName);
    expect(screen.getByText(description).textContent).toBe(description);

    const cancelButton = screen.getByRole('button', { name: `Annuler l’exécution de ${toolName}` });
    const runButton = screen.getByRole('button', { name: `Exécuter ${toolName}` });
    expect(cancelButton.className).toContain('min-h-[44px]');
    expect(runButton.className).toContain('min-h-[44px]');

    fireEvent.click(cancelButton);
    fireEvent.click(runButton);

    expect(addToolResult).toHaveBeenNthCalledWith(1, {
      toolCallId: 'call-1',
      result: toolConstants.TOOL_EXECUTION_APPROVAL.REJECT,
    });
    expect(addToolResult).toHaveBeenNthCalledWith(2, {
      toolCallId: 'call-1',
      result: toolConstants.TOOL_EXECUTION_APPROVAL.APPROVE,
    });

    addToolResult.mockClear();
    fireEvent.keyDown(window, { ctrlKey: true, key: 'Enter' });
    fireEvent.keyDown(window, { ctrlKey: true, key: 'Backspace' });

    expect(addToolResult).toHaveBeenNthCalledWith(1, {
      toolCallId: 'call-1',
      result: toolConstants.TOOL_EXECUTION_APPROVAL.APPROVE,
    });
    expect(addToolResult).toHaveBeenNthCalledWith(2, {
      toolCallId: 'call-1',
      result: toolConstants.TOOL_EXECUTION_APPROVAL.REJECT,
    });
  });

  it('localizes field labels and preserves parameters, results, server names, and tool names', () => {
    const toolName = 'postgres.execute_sql';
    const serverName = 'mcp.postgres.eu-west-1';
    const description = 'Run SELECT * FROM audit_log';
    const args = { sql: 'SELECT * FROM audit_log', variable: 'DATABASE_URL' };

    const result = {
      stderr: 'TypeError: ENOENT',
      url: 'https://api.example.test/v1/results',
      html: '<img src=x onerror=alert(1)>',
    };

    const { container } = renderWithLanguage(
      'fr',
      <ToolInvocations
        toolInvocations={[toolResult('result-1', toolName, args, result)]}
        toolCallAnnotations={[annotation('result-1', serverName, toolName, description)]}
        addToolResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Afficher le détail des appels d’outils/u }));

    const resultsRegion = screen.getByRole('region', { name: 'Résultats des appels d’outils' });
    expect(within(resultsRegion).getByText('Serveur:')).toBeTruthy();
    expect(within(resultsRegion).getByText('Outil:')).toBeTruthy();
    expect(within(resultsRegion).getByText('Paramètres:')).toBeTruthy();
    expect(within(resultsRegion).getByText('Résultat:')).toBeTruthy();
    expect(within(resultsRegion).getByText(serverName).textContent).toBe(serverName);
    expect(within(resultsRegion).getByText(toolName).textContent).toBe(toolName);
    expect(within(resultsRegion).getByText(description).textContent).toBe(description);

    const parameters = screen.getByRole('region', { name: `Paramètres de ${toolName}` });
    const renderedResult = screen.getByRole('region', { name: `Résultat de ${toolName}` });
    expect(parameters.textContent).toContain('SELECT * FROM audit_log');
    expect(parameters.textContent).toContain('DATABASE_URL');
    expect(renderedResult.textContent).toContain('TypeError: ENOENT');
    expect(renderedResult.textContent).toContain('https://api.example.test/v1/results');
    expect(renderedResult.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText('Server:')).toBeNull();
    expect(screen.queryByText('Parameters:')).toBeNull();
    expect(screen.queryByText('Result:')).toBeNull();
  });

  it('replaces internal error and approval sentinels with reviewed French copy', () => {
    const toolName = 'deploy.production';

    renderWithLanguage(
      'fr',
      <ToolInvocations
        toolInvocations={[
          toolResult('result-error', toolName, { environment: 'production' }, toolConstants.TOOL_EXECUTION_ERROR),
          toolResult(
            'result-approved',
            'filesystem.write_file',
            { path: '/workspace/src/App.tsx' },
            toolConstants.TOOL_EXECUTION_APPROVAL.APPROVE,
          ),
        ]}
        toolCallAnnotations={[
          annotation('result-error', 'mcp.deploy', toolName, 'Deploy to production'),
          annotation('result-approved', 'mcp.filesystem', 'filesystem.write_file', 'Write a file'),
        ]}
        addToolResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Afficher le détail des appels d’outils/u }));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Échec de l’exécution');
    expect(alert.textContent).toContain('Impossible d’exécuter l’outil.');
    expect(screen.getByRole('status').textContent).toContain('Exécution autorisée');
    expect(screen.queryByText(toolConstants.TOOL_EXECUTION_ERROR)).toBeNull();
    expect(screen.queryByText(toolConstants.TOOL_EXECUTION_APPROVAL.APPROVE)).toBeNull();
  });

  it('updates copy when the active locale changes and uses English as the non-French fallback', async () => {
    const toolName = 'github.create_commit';

    const { i18n } = renderWithLanguage(
      'es',
      <ToolInvocations
        toolInvocations={[toolCall('call-switch', toolName)]}
        toolCallAnnotations={[annotation('call-switch', 'mcp.github', toolName, 'Create a commit')]}
        addToolResult={vi.fn()}
      />,
    );

    expect(screen.getByText('Tool calls')).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    expect(screen.getByText('Appels d’outils')).toBeTruthy();
    expect(screen.queryByText('Tool calls')).toBeNull();
  });
});
