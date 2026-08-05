import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import McpServerList from './tabs/mcp/McpServerList';
import McpStatusBadge from './tabs/mcp/McpStatusBadge';
import HealthStatusBadge from './tabs/providers/local/HealthStatusBadge';
import { settingsEn, settingsFr } from '~/lib/i18n/catalogs/settings';

function renderIn(language: 'en' | 'fr', node: ReactNode) {
  const instance = createInstance();
  void instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: {
      en: { translation: settingsEn },
      fr: { translation: settingsFr },
    },
    interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
    initImmediate: false,
  });

  return renderToStaticMarkup(<I18nextProvider i18n={instance}>{node}</I18nextProvider>);
}

describe('Settings translated rendering', () => {
  it('renders local-provider and MCP statuses in French', () => {
    const html = renderIn(
      'fr',
      <>
        <HealthStatusBadge status="healthy" responseTime={12} />
        <McpStatusBadge status="unavailable" />
      </>,
    );

    expect(html).toContain('Sain');
    expect(html).toContain('Indisponible');
    expect(html).not.toContain('Healthy');
    expect(html).not.toContain('Unavailable');
  });

  it('renders the empty MCP configuration state in either active locale', () => {
    const props = {
      serverEntries: [],
      expandedServer: null,
      checkingServers: false,
      toggleServerExpanded: () => undefined,
    } as const;

    expect(renderIn('fr', <McpServerList {...props} />)).toContain('Aucun serveur MCP configuré');
    expect(renderIn('en', <McpServerList {...props} />)).toContain('No MCP servers configured');
  });
});
