/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { GitProviderConnectPanel } from './GitProviderConnectPanel';
import { useKeybindings } from '~/lib/hooks/useKeybindings';
import { createI18nInstance } from '~/lib/i18n/runtime';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function open() {
  const runAction = vi.fn();
  vi.stubGlobal('fetch', vi.fn());

  function Harness() {
    useKeybindings({
      bindings: [
        { combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' },
        { combo: 'cmd+s', action: 'file.save', label: '', description: '', category: 'File' },
      ],
      getContext: () => ({}),
      runAction,
    });
    return (
      <I18nextProvider i18n={createI18nInstance('en')}>
        <button>Outside</button>
        <GitProviderConnectPanel projectId="synthetic" />
      </I18nextProvider>
    );
  }
  render(<Harness />);

  const trigger = screen.getByRole('button', { name: /Add remote URL from the Git panel/i });
  trigger.focus();
  fireEvent.click(trigger);

  return { runAction, trigger };
}
it.each(['input', 'Close', 'submit'])('Escape reaches remote dialog from %s with global keybindings', (target) => {
  const { trigger, runAction } = open();
  fireEvent.change(screen.getByRole('textbox', { name: 'Remote URL', exact: true }), {
    target: { value: 'https://example.invalid/isolated.git' },
  });

  const control =
    target === 'input'
      ? screen.getByRole('textbox', { name: 'Remote URL', exact: true })
      : target === 'Close'
        ? screen.getByRole('button', { name: 'Close', exact: true })
        : (screen.getByRole('dialog').querySelector('button[type="submit"]') as HTMLElement);
  control.focus();
  expect(document.activeElement).toBe(control);
  fireEvent.keyDown(control, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fetch).not.toHaveBeenCalled();
  expect(runAction).not.toHaveBeenCalled();
});
it('keeps Ctrl+S and outside Escape routed globally', () => {
  const { runAction } = open();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Close', exact: true }), { key: 's', ctrlKey: true });
  expect(runAction.mock.calls[0][0]).toBe('file.save');
  fireEvent.keyDown(screen.getByRole('button', { name: 'Outside', exact: true }), { key: 'Escape' });
  expect(runAction.mock.calls[1][0]).toBe('overlay.close');
  expect(screen.getByRole('dialog')).toBeTruthy();
});
