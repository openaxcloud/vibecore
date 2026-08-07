import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { describe, expect, it } from 'vitest';

import { AgentWalkthrough } from './AgentWalkthrough';
import { getAgentWalkthroughCopy } from '~/lib/i18n/catalogs/agent-walkthrough';
import { createI18nInstance } from '~/lib/i18n/runtime';

function renderWalkthrough(language: 'en' | 'fr') {
  return renderToStaticMarkup(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <AgentWalkthrough />
    </I18nextProvider>,
  );
}

describe('AgentWalkthrough i18n', () => {
  it('uses English as the fallback language', () => {
    expect(getAgentWalkthroughCopy('de').title).toBe('Agent panel walkthrough');
  });

  it('renders professional French copy while preserving technical identifiers', () => {
    const markup = renderWalkthrough('fr');

    expect(markup).toContain('Guide du panneau de l’agent');
    expect(markup).toContain('Fichiers modifiés');
    expect(markup).toContain('Avant de commencer');
    expect(markup).not.toContain('Agent panel walkthrough');
    expect(markup).not.toContain('Files changed');
    expect(markup).toContain('src/App.tsx');
    expect(markup).toContain('/snapshot');
    expect(markup).toContain('localStorage.setItem');
  });
});
