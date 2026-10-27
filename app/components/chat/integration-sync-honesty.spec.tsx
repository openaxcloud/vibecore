/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntegrationGithubVerification } from './IntegrationGithubVerification';
import { platformStateLabel } from './platform-state-label';
import { PanelButton, PanelInput } from '~/components/project-ide/PanelPrimitives';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  baseChatAstEn,
  baseChatAstFr,
  formatBaseChatAstDate,
  formatBaseChatAstDateTime,
  formatBaseChatAstNumber,
} from '~/lib/i18n/catalogs/base-chat-ast';
import { chatEn, chatFr } from '~/lib/i18n/catalogs/chat';

/*
 * Actual private component declarations, no copied UI logic. Authentication card
 * is an unrelated fixture seam; state is explicit input, not a real connector.
 */
const source = readFileSync(resolve(import.meta.dirname, 'BaseChat.tsx'), 'utf8');
const tree = ts.createSourceFile('BaseChat.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const names = [
  'ProjectIntegrationsPanel',
  'PanelRows',
  'resolvedBaseChatLanguage',
  'INTEGRATION_CATALOG',
  'INTEGRATION_CATEGORIES',
  'INTEGRATION_PERMISSIONS',
  'integrationPermissions',
];
const nodes = tree.statements.filter(
  (node) =>
    (ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? '')) ||
    (ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((entry) => names.includes(entry.name.getText(tree)))),
);
expect(nodes).toHaveLength(names.length);

const compiled = ts.transpileModule(
  nodes.map((node) => node.getText(tree)).join('\n') + '\nreturn ProjectIntegrationsPanel;',
  {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
  },
).outputText;

let root: Root | undefined;
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

async function mount(
  language: 'en' | 'fr',
  capability: boolean,
  webhooks: Array<{
    id: string;
    name: string;
    url: string;
    events: string[];
    active: boolean;
    successRate?: number;
  }> = [],
  apiKeys: Array<{ id: string; name: string; prefix: string; permissions: string[]; expiresAt: string }> = [],
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const copy: Record<string, string> =
    language === 'fr' ? { ...chatFr, ...baseChatAstFr } : { ...chatEn, ...baseChatAstEn };
  const t = (key: string, vars?: Record<string, unknown>) =>
    (copy[key] ?? key).replace(/\{(\w+)\}/gu, (_, name: string) => String(vars?.[name] ?? `{${name}}`));
  const bindings = {
    React,
    IntegrationGithubVerification,
    useState: React.useState,
    PanelButton,
    PanelInput,
    EmptyState,
    platformStateLabel,
    formatBaseChatAstDate,
    formatBaseChatAstDateTime,
    formatBaseChatAstNumber,
    useTranslation: () => ({ t, i18n: { language, resolvedLanguage: language } }),
    AddAuthenticationCard: () => <div data-unrelated-auth-fixture />,
  };
  const Panel = new Function(...Object.keys(bindings), compiled)(...Object.values(bindings)) as React.ComponentType<{
    data: unknown;
    projectId: string;
    onSubmit: (event: React.FormEvent) => void;
    busy: boolean;
  }>;
  const data = {
    ...(capability ? { integrationSync: { available: false, code: 'INTEGRATION_SYNC_UNAVAILABLE' } } : {}),
    integrationsState: {
      integrations: {
        slack: { connected: true, status: 'active', lastSync: '2020-01-01T00:00:00.000Z' },
        github: { connected: true, status: 'active', lastSync: '2020-01-01T00:00:00.000Z' },
      },
      webhooks,
      apiKeys,
    },
  };

  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Panel data={data} projectId="fixture" onSubmit={onSubmit} busy={false} />));

  return { container, onSubmit, data, t };
}

for (const language of ['en', 'fr'] as const) {
  describe(`Sync UI ${language}`, () => {
    for (const capability of [true, false]) {
      it(`keeps Sync disabled with ${capability ? 'explicit false' : 'missing'} capability and explains why`, async () => {
        const { container, onSubmit } = await mount(language, capability);
        const connected = container.querySelectorAll<HTMLButtonElement>('.bolt-project-integrations-tabs button')[1];
        await act(async () => connected.click());

        const list = container.querySelector('[data-testid="list-connected"]')!;
        const button = list.querySelector<HTMLInputElement>('input[value="sync"]')!.form!.querySelector('button')!;
        expect(button.disabled).toBe(true);
        expect(list.textContent).toMatch(language === 'fr' ? /synchronisation.*indisponible/i : /sync.*unavailable/i);
        expect(list.textContent).toMatch(language === 'fr' ? /non vérifiée/i : /unverified/i);
        expect(list.textContent).not.toContain('2020');
        await act(async () => button.click());
        expect(onSubmit).not.toHaveBeenCalled();
      });
    }
    it('uses personal GitHub verification instead of the legacy token configuration', async () => {
      const { container, onSubmit } = await mount(language, true);
      const card = container.querySelector('[data-testid="integration-card-github"]')!;
      expect(card.querySelector('em[data-status="active"]')).toBeNull();
      await act(async () =>
        container.querySelector<HTMLButtonElement>('[data-testid="button-connect-github"]')!.click(),
      );

      const config = container.querySelector('[data-testid="dialog-integration-config"]')!;
      expect(config.querySelector('input[name="apiToken"]')).toBeNull();
      expect(config.querySelector('input[value="connect"]')).toBeNull();
      expect(config.querySelector('input[value="disconnect"]')).toBeNull();
      expect(config.textContent).not.toContain('2020');
      expect(config.textContent).toMatch(language === 'fr' ? /GitHub/ : /GitHub/);
      expect(onSubmit).not.toHaveBeenCalled();
    });
    it('does not turn a stored timestamp into verified history, while keeping configuration reachable', async () => {
      const { container, data } = await mount(language, true);
      await act(async () =>
        container.querySelector<HTMLButtonElement>('[data-testid="button-connect-slack"]')!.click(),
      );

      const config = container.querySelector('[data-testid="dialog-integration-config"]')!;
      expect(config.textContent).toMatch(language === 'fr' ? /non vérifiée/i : /unverified/i);
      expect(config.textContent).not.toContain('2020');
      expect(config.textContent).not.toMatch(/stops all syncs|arrête immédiatement toutes les synchronisations/i);
      expect(config.querySelector('input[value="disconnect"]')).not.toBeNull();
      expect(data.integrationsState.integrations.slack.lastSync).toBe('2020-01-01T00:00:00.000Z');
    });
  });
  describe(`webhook delivery metrics UI ${language}`, () => {
    for (const successRate of [undefined, 100, 42, 0]) {
      it(`does not treat stored successRate=${successRate} as a verified delivery metric`, async () => {
        const webhook = {
          id: 'fixture-hook',
          name: 'Fixture endpoint',
          url: 'https://fixture.invalid/hook',
          events: ['deploy.success'],
          active: true,
          ...(successRate === undefined ? {} : { successRate }),
        };

        const { container, data, onSubmit } = await mount(language, true, [webhook]);
        const tab = container.querySelectorAll<HTMLButtonElement>('.bolt-project-integrations-tabs button')[2];
        await act(async () => tab.click());

        const row = container.querySelector('[data-testid="webhook-fixture-hook"]')!;
        expect(row.textContent).toMatch(
          language === 'fr' ? /mesures de livraison indisponibles/i : /delivery metrics unavailable/i,
        );
        expect(row.textContent).not.toMatch(/\d|%/);
        expect(row.textContent).toContain(webhook.name);
        expect(row.textContent).toContain(webhook.url);
        expect(row.textContent).toContain('deploy.success');
        expect(row.querySelector('input[value="toggle-webhook"]')).not.toBeNull();
        expect(row.querySelector('input[value="delete-webhook"]')).not.toBeNull();
        expect(data.integrationsState.webhooks).toEqual([webhook]);
        expect(onSubmit).not.toHaveBeenCalled();
      });
    }
  });
  it(`still renders the stored API key expiration in ${language}`, async () => {
    const apiKey = {
      id: 'fixture-key',
      name: 'Fixture key',
      prefix: 'fixture',
      permissions: ['read'],
      expiresAt: '2020-01-01T00:00:00.000Z',
    };

    const { container, onSubmit } = await mount(language, true, [], [apiKey]);
    const tab = container.querySelectorAll<HTMLButtonElement>('.bolt-project-integrations-tabs button')[3];
    await act(async () => tab.click());

    const row = container.querySelector('[data-testid="api-key-fixture-key"]')!;
    expect(row.textContent).toContain(formatBaseChatAstDate(language, apiKey.expiresAt));
    expect(row.querySelector('input[value="revoke-api-key"]')).not.toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
}
