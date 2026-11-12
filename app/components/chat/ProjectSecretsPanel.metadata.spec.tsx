/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectSecretsPanel } from './ProjectSecretsPanel';
import { formatBaseChatAstDateTime } from '~/lib/i18n/catalogs/base-chat-ast';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it.each(['en', 'fr'])('renders only non-sensitive server metadata in %s, updates after reload', (language) => {
  const onSubmit = vi.fn();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  const props = { projectId: 'metadata-test', language, busy: false, onSubmit };
  const first = '2026-05-13T14:24:03.000Z';
  const second = '2026-05-14T14:24:03.000Z';

  const view = render(
    <ProjectSecretsPanel {...props} data={{ secrets: [{ key: 'DATABASE_URL', updatedAt: first }] }} />,
  );
  expect(screen.getByTestId('secret-updated-at').getAttribute('datetime')).toBe(first);
  expect(screen.getByTestId('secret-updated-at').textContent).toBe(formatBaseChatAstDateTime(language, first));
  expect(screen.getByTestId('secret-row-DATABASE_URL').textContent).toContain('••••••••');
  view.rerender(<ProjectSecretsPanel {...props} data={{ secrets: [{ key: 'DATABASE_URL', updatedAt: second }] }} />);
  expect(screen.getByTestId('secret-updated-at').getAttribute('datetime')).toBe(second);
  expect(fetch).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});
it.each([undefined, null, 'not-a-date'])('does not invent a timestamp when metadata is %s', (updatedAt) => {
  render(
    <ProjectSecretsPanel
      projectId="metadata-missing"
      language="en"
      busy={false}
      onSubmit={vi.fn()}
      data={{ secrets: [{ key: 'DATABASE_URL', updatedAt }] }}
    />,
  );
  expect(screen.queryByTestId('secret-updated-at')).toBeNull();
  expect(screen.getByTestId('secret-row-DATABASE_URL').textContent).toContain('••••••••');
});
