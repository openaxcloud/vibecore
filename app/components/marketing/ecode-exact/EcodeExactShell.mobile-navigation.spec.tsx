/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EcodeExactPublicNavbar } from './EcodeExactShell';
import { createI18nInstance } from '~/lib/i18n/runtime';

let desktop = false;

const listeners = new Set<(event: MediaQueryListEvent) => void>();

beforeEach(() => {
  desktop = false;
  listeners.clear();
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return query === '(min-width: 1280px)' && desktop;
    },
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      if (query === '(min-width: 1280px)') {
        listeners.add(listener);
      }
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mountNavbar() {
  const router = createMemoryRouter([{ path: '/', element: <EcodeExactPublicNavbar /> }]);
  render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );

  return screen.getByRole('button', { name: 'Open mobile menu' });
}

it.each(['Escape', 'close button'])('returns focus to the opener after %s', async (method) => {
  const trigger = mountNavbar();
  trigger.focus();
  fireEvent.click(trigger);

  const dialog = await screen.findByRole('dialog');
  expect(document.body).toHaveAttribute('data-scroll-locked', '1');

  if (method === 'Escape') {
    fireEvent.keyDown(dialog, { key: 'Escape' });
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Close mobile menu' }));
  }

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(document.body).not.toHaveAttribute('data-scroll-locked');
});

it('closes the drawer at the desktop breakpoint and releases the page', async () => {
  const trigger = mountNavbar();
  trigger.focus();
  fireEvent.click(trigger);
  await screen.findByRole('dialog');
  act(() => {
    desktop = true;
    listeners.forEach((listener) => listener({ matches: true } as MediaQueryListEvent));
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByTestId('link-login')).toHaveFocus());
  expect(document.body).not.toHaveAttribute('data-scroll-locked');
  expect(document.body.style.pointerEvents).not.toBe('none');
  expect(screen.getByRole('banner')).not.toHaveAttribute('aria-hidden', 'true');
});

it('keeps the drawer open while the viewport remains below the desktop breakpoint', async () => {
  fireEvent.click(mountNavbar());

  const dialog = await screen.findByRole('dialog');
  act(() => listeners.forEach((listener) => listener({ matches: false } as MediaQueryListEvent)));
  expect(dialog).toBeInTheDocument();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
