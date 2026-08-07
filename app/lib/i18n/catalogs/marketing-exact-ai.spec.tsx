import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { getMarketingExactAiCopy, marketingExactAiEn, marketingExactAiFr } from './marketing-exact-ai';
import AI from '~/components/marketing/ecode-exact/pages/AI';
import AiAgent from '~/components/marketing/ecode-exact/pages/AIAgent';
import { createI18nInstance } from '~/lib/i18n/runtime';

function leafPaths(value: unknown, path: string[] = []): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => leafPaths(item, [...path, String(index)]));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => leafPaths(item, [...path, key]));
  }

  return [path.join('.')];
}

function renderInFrench(node: ReactNode) {
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/'] });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  try {
    return renderToStaticMarkup(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RouterProvider router={router} />
      </I18nextProvider>,
    );
  } finally {
    consoleError.mockRestore();
  }
}

describe('exact AI marketing catalogs', () => {
  it('keeps complete EN/FR structural parity', () => {
    expect(leafPaths(marketingExactAiFr)).toEqual(leafPaths(marketingExactAiEn));
  });

  it('falls back to English and resolves professional French copy', () => {
    expect(getMarketingExactAiCopy('de').exactAi.ai.heroAccent).toBe('Builds Your App');
    expect(getMarketingExactAiCopy('fr').exactAi.ai.heroAccent).toBe('crée votre application');
    expect(getMarketingExactAiCopy('fr').exactAi.aiAgent.capture.action).toBe('Voir le flux Git');
  });

  it('renders both exact AI pages in French', () => {
    const ai = renderInFrench(<AI />);
    const aiAgent = renderInFrench(<AiAgent />);

    expect(ai).toContain('Une IA qui');
    expect(ai).toContain('Lire la démonstration vidéo');
    expect(ai).not.toContain('AI That');
    expect(aiAgent).toContain('Créer une application devient aussi simple que tenir une conversation');
    expect(aiAgent).toContain('Ce que vous voyez');
    expect(aiAgent).not.toContain('Building apps is now as easy as having a conversation');
  });

  it('preserves brand names, technical identifiers and URLs', () => {
    const ai = renderInFrench(<AI />);
    const aiAgent = renderInFrench(<AiAgent />);

    expect(ai).toContain('Anthropic');
    expect(ai).toContain('OpenAI');
    expect(aiAgent).toContain('app.e-code.ai');
  });
});
