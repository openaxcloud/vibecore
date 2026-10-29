/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { GitProviderConnectPanel } from '~/components/git/GitProviderConnectPanel';
import { createI18nInstance } from '~/lib/i18n/runtime';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open() {
  vi.stubGlobal('fetch', vi.fn());

  const view = render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <GitProviderConnectPanel projectId="isolated" />
    </I18nextProvider>,
  );

  const trigger = screen.getByRole('button', { name: /Add remote URL from the Git panel/i });
  trigger.focus();
  fireEvent.click(trigger);

  return { trigger, view };
}
it('exposes an explicitly named nonmodal dialog, rather than a form region', () => {
  open();

  const dialog = screen.getByRole('dialog', { name: 'Configure Custom remote' });
  expect(dialog.getAttribute('aria-modal')).toBeNull();
  expect(dialog.querySelector('form')).not.toBeNull();
});
it('Escape inside the remote URL dialog dismisses it without a request', () => {
  open();

  const input = screen.getByRole('textbox', { name: 'Remote URL', exact: true });
  input.focus();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
it('Close restores focus to the opener without a request', () => {
  const { trigger } = open();
  const close = screen.getByRole('button', { name: 'Close', exact: true });
  close.focus();
  fireEvent.click(close);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(trigger);
});
it('opening the dialog moves keyboard focus inside it', () => {
  open();
  expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
});
it('Escape from an outside control is not consumed and leaves the dialog open', () => {
  const { view } = open();
  const outside = document.createElement('input');
  document.body.append(outside);

  const listener = vi.fn();
  document.addEventListener('keydown', listener);

  try {
    outside.focus();

    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    outside.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.activeElement).toBe(outside);
  } finally {
    document.removeEventListener('keydown', listener);
    outside.remove();
    view.unmount();
  }
});
it('does not focus an unavailable opener when closing', () => {
  const { trigger, view } = open();
  view.rerender(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <GitProviderConnectPanel projectId="isolated" busy />
    </I18nextProvider>,
  );

  const focus = vi.spyOn(trigger, 'focus');
  const input = screen.getByRole('textbox', { name: 'Remote URL', exact: true });
  input.focus();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(focus).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it.each([true, false])('a late remote result ok=%s does not steal focus from an outside control', async (ok) => {
  open();

  let complete!: (r: Response) => void;
  vi.mocked(fetch).mockReturnValue(
    new Promise<Response>((resolve) => {
      complete = resolve;
    }),
  );

  const input = screen.getByRole('textbox', { name: 'Remote URL', exact: true });
  fireEvent.change(input, { target: { value: 'https://example.invalid/repo.git' } });
  fireEvent.submit(input.closest('form')!);

  const outside = document.createElement('input');
  document.body.append(outside);
  outside.focus();

  try {
    await act(async () => complete(Response.json({ ok }, { status: ok ? 200 : 503 })));
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});
it('navigation does not restore focus to an old opener', () => {
  const { trigger, view } = open();
  const focus = vi.spyOn(trigger, 'focus');
  const outside = document.createElement('input');
  document.body.append(outside);
  outside.focus();

  try {
    view.rerender(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <GitProviderConnectPanel projectId="isolated-next" />
      </I18nextProvider>,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);
  } finally {
    outside.remove();
  }
});
