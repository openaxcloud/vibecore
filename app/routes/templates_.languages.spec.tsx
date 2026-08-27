/**
 * @vitest-environment jsdom
 *
 * Regression guard: the "Browse templates by language" page used to render one
 * `<Link to="/templates">` per language, promising a language filter that the
 * gallery never applied — every tile silently landed on the identical unfiltered
 * gallery. The page now presents the per-language counts as non-interactive
 * stats and offers a single honest "View all templates" CTA. These tests pin
 * that contract so the dead-filter regression cannot return.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The route pulls in a public shell + a `.server` catalog module; stub both so
 * the spec can render the component in isolation under jsdom.
 */
vi.mock('~/components/dashboard/SaaSLayout', () => ({
  PublicShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('~/lib/marketing/ecode-template-catalog.server', () => ({
  getEcodeTemplateCatalog: () => [],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

const loaderData = {
  language: 'en' as const,
  loadState: 'ready' as const,
  total: 8,
  languages: [
    { name: 'Python', count: 5 },
    { name: 'Go', count: 3 },
  ],
};

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return {
    ...actual,
    useLoaderData: () => loaderData,
    useRevalidator: () => ({ state: 'idle', revalidate: vi.fn() }),
  };
});

import TemplatesLanguagesRoute from './templates_.languages';

afterEach(() => {
  cleanup();
});

function renderRoute() {
  return render(
    <MemoryRouter>
      <TemplatesLanguagesRoute />
    </MemoryRouter>,
  );
}

describe('templates by language page', () => {
  it('renders each language with its real count as a non-interactive stat', () => {
    renderRoute();

    const list = screen.getByRole('list', { name: /template count by programming language/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);

    // Counts are present...
    expect(within(items[0]).getByText('Python')).not.toBeNull();
    expect(within(items[0]).getByText('5')).not.toBeNull();
    expect(within(items[1]).getByText('Go')).not.toBeNull();
    expect(within(items[1]).getByText('3')).not.toBeNull();

    // ...but the language entries are NOT links (no dead per-language filter).
    expect(within(list).queryByRole('link')).toBeNull();
  });

  it('offers exactly one "View all templates" CTA pointing at the gallery', () => {
    renderRoute();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);

    const cta = links[0];
    expect(cta.textContent).toMatch(/view all templates/i);
    expect(cta.getAttribute('href')).toBe('/templates');
  });

  it('does not claim that picking a language filters the gallery', () => {
    renderRoute();

    // The old copy implied a working per-language filter; it must be gone.
    expect(screen.queryByText(/pick a language to open the gallery/i)).toBeNull();
  });
});
