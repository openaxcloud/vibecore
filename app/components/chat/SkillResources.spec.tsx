/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillResources, type SkillResourceSnapshot } from './SkillResources';
import { createI18nInstance } from '~/lib/i18n/runtime';

const snapshot: SkillResourceSnapshot = {
  path: 'references/example.md',
  kind: 'reference',
  bytes: 42,
  content: 'Synthetic saved reference.\nSecond line.',
  contentHash: 'a'.repeat(64),
};

function mount(resources: SkillResourceSnapshot[], language: 'fr' | 'en' = 'en') {
  return render(
    <I18nextProvider i18n={createI18nInstance(language)}>
      <SkillResources resources={resources} />
    </I18nextProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(['fr', 'en'] as const)('saved skill resource display (%s)', (language) => {
  it('opens and closes the saved text with an accessible control, without fetching', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    mount([snapshot], language);

    const button = screen.getByRole('button', { name: /references\/example.md/ });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region')).toBeNull();
    expect(button.textContent).toContain(language === 'fr' ? 'Copie sauvegardée disponible' : 'Saved copy available');
    fireEvent.click(button);

    const content = screen.getByRole('region', {
      name: `${language === 'fr' ? 'Contenu de' : 'Contents of'} ${snapshot.path}`,
    });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-controls')).toBe(content.id);
    expect(content.textContent).toBe(snapshot.content);
    expect(content.tabIndex).toBe(0);
    expect(screen.getByText(/SHA-256/).textContent).toContain(snapshot.contentHash);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps legacy metadata explicitly unavailable instead of offering a fake preview', () => {
    const { content: _content, contentHash: _hash, ...metadata } = snapshot;
    mount([metadata], language);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(snapshot.path)).toBeTruthy();
    expect(
      screen.getByText(
        language === 'fr'
          ? 'Contenu indisponible pour cette installation.'
          : 'Contents unavailable for this installation.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('region')).toBeNull();
  });
});

it('renders markup and executable-looking text as inert characters, never HTML', () => {
  const content =
    '<script>window.__skillExecuted = true</script>\n<img src="https://example.invalid/x" onerror="alert(1)">';

  const { container } = mount([{ ...snapshot, content }]);
  fireEvent.click(screen.getByRole('button'));

  expect(screen.getByRole('region').textContent).toBe(content);
  expect(container.querySelector('script, img, iframe')).toBeNull();
  expect('__skillExecuted' in window).toBe(false);
});

it('keeps separate resource previews independently open and does not label missing content available', () => {
  mount([
    snapshot,
    { ...snapshot, path: 'assets/example.json', content: '{"synthetic":true}' },
    { path: 'references/legacy.md', kind: 'reference', bytes: 12 },
  ]);

  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[0]);
  fireEvent.click(buttons[1]);
  expect(screen.getAllByRole('region')).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(screen.getAllByRole('region')).toHaveLength(1);
  expect(screen.getByRole('region').textContent).toBe('{"synthetic":true}');
});

it('does not render an empty resources section', () => {
  const { container } = mount([]);
  expect(container.childElementCount).toBe(0);
});
