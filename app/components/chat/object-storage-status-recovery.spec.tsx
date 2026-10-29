/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelButton, PanelEmptyState } from '~/components/project-ide/PanelPrimitives';
import { baseChatAstEn, baseChatAstFr } from '~/lib/i18n/catalogs/base-chat-ast';
import { chatEn, chatFr } from '~/lib/i18n/catalogs/chat';

// Render the actual private component, not a duplicate state-machine fixture.
const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const declaration = tree.statements.find(
  (node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && node.name?.text === 'ProjectObjectStoragePanel',
);

if (!declaration) {
  throw new Error('Object Storage component missing');
}

const compiled = ts.transpileModule(`${declaration.getText(tree)}\nreturn ProjectObjectStoragePanel;`, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
}).outputText;

function mount(language: 'en' | 'fr' = 'en') {
  const copy: Record<string, string> =
    language === 'fr' ? { ...chatFr, ...baseChatAstFr } : { ...chatEn, ...baseChatAstEn };

  const t = (key: string) => copy[key] ?? key;

  const bindings = {
    React,
    useState: React.useState,
    useRef: React.useRef,
    useEffect: React.useEffect,
    useCallback: React.useCallback,
    PanelButton,
    PanelEmptyState,
    useTranslation: () => ({ t, i18n: { language } }),
    resolvedBaseChatLanguage: () => language,
  };

  const Panel = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as React.ComponentType<{
    projectId: string;
    busy: boolean;
  }>;

  return render(<Panel projectId="synthetic-storage" busy={false} />);
}

const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Object Storage read-only status recovery', () => {
  it.each(['en', 'fr'] as const)('distinguishes a failed probe and retries only status in %s', async (language) => {
    let finishRetry: ((value: unknown) => void) | undefined;

    const retry = new Promise((resolve) => {
      finishRetry = resolve;
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ error: 'synthetic unavailable' }, false))
      .mockReturnValueOnce(retry);
    vi.stubGlobal('fetch', fetch);
    mount(language);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(language === 'fr' ? 'Impossible de joindre' : 'could not be reached');
    expect(screen.queryByRole('button', { name: /Enable Object Storage|Activer/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: language === 'fr' ? 'Réessayer' : 'Retry' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: /Enable Object Storage|Activer/i })).toBeNull();
    finishRetry!(response({ enabled: false, provisioned: false }));
    await screen.findByText(
      language === 'fr'
        ? chatFr['chat.copy.objectStorageIsNotAvailableYet_0f2325e6']
        : chatEn['chat.copy.objectStorageIsNotAvailableYet_0f2325e6'],
    );
    expect(screen.queryByRole('alert')).toBeNull();

    for (const [url, options] of fetch.mock.calls) {
      expect(url).toBe('/api/projects/synthetic-storage/ide-panel/object-storage');
      expect(options.method).toBe('POST');
      expect(options.body.get('intent')).toBe('status');
    }
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([{}, { enabled: true }, { enabled: 'true', provisioned: false }])(
    'does not enable actions for malformed status %j',
    async (body) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(body)));
      mount();
      await screen.findByRole('alert');
      expect(screen.queryByRole('button', { name: 'Enable Object Storage' })).toBeNull();
    },
  );

  it('does not treat a non-success HTTP response as confirmed disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ enabled: false, provisioned: false }, false)));
    mount();
    await screen.findByRole('alert');
    expect(screen.queryByText(chatEn['chat.copy.objectStorageIsNotAvailableYet_0f2325e6'])).toBeNull();
  });

  it('offers Enable only after a successful ready response confirms no bucket', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ enabled: true, provisioned: false }));
    vi.stubGlobal('fetch', fetch);
    mount();
    await screen.findByRole('button', { name: 'Enable Object Storage' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].body.get('intent')).toBe('status');
  });
});
