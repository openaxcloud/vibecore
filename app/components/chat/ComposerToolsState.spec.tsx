/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { ComposerToolsProvider, useComposerToolsMenu } from './ComposerToolsState';
import { ColorSchemeDialog } from '~/components/ui/ColorSchemeDialog';
import { createI18nInstance } from '~/lib/i18n/runtime';

const i18n = createI18nInstance('en');
const saved = vi.fn();

afterEach(() => {
  cleanup();
  saved.mockClear();
});

function Tools() {
  const [open, setOpen] = useComposerToolsMenu();

  return (
    <>
      <button onClick={() => setOpen((previous) => !previous)}>Tools</button>
      <button
        onClick={() => {
          setOpen((previous) => !previous);
          setOpen((previous) => !previous);
        }}
      >
        Toggle twice
      </button>
      {open ? <ColorSchemeDialog triggerVariant="menu" setDesignScheme={saved} /> : null}
    </>
  );
}

function tree(instance: string, projectId = 'p1', workspaceId = 'w1', windowId = 'main') {
  return (
    <I18nextProvider i18n={i18n}>
      <ComposerToolsProvider projectId={projectId} workspaceId={workspaceId} windowId={windowId}>
        <Tools key={instance} />
      </ComposerToolsProvider>
    </I18nextProvider>
  );
}

function openPalette() {
  fireEvent.click(screen.getByRole('button', { name: 'Tools', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Design palette', exact: true }));
}

it('keeps the real palette, edited draft and selected section across component replacement', () => {
  const view = render(tree('shell'));
  openPalette();

  const oldDialog = screen.getByRole('dialog');
  fireEvent.change(document.getElementById('color-input-primary')!, { target: { value: '#112233' } });
  fireEvent.click(screen.getByRole('button', { name: 'Typography', exact: true }));
  view.rerender(tree('chat'));
  expect(oldDialog.isConnected).toBe(false);
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Typography', exact: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes', exact: true }));
  expect(saved).toHaveBeenCalledWith(
    expect.objectContaining({ palette: expect.objectContaining({ primary: '#112233' }) }),
  );
});

it('does not reopen an explicitly closed palette after replacement', () => {
  const view = render(tree('shell'));
  openPalette();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  view.rerender(tree('chat'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('closing the tools menu clears the open palette and abandons its edits on the next opening', () => {
  const view = render(tree('shell'));
  openPalette();
  fireEvent.change(document.getElementById('color-input-primary')!, { target: { value: '#112233' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tools', exact: true }));
  view.rerender(tree('chat'));
  expect(screen.queryByRole('dialog')).toBeNull();
  openPalette();
  expect((document.getElementById('color-input-primary')! as HTMLInputElement).value).not.toBe('#112233');
});

it.each(['project', 'workspace', 'window'])('discards interactions when the %s scope changes', (scope) => {
  const view = render(tree('shell'));
  openPalette();
  view.rerender(
    tree(
      'chat',
      scope === 'project' ? 'p2' : 'p1',
      scope === 'workspace' ? 'w2' : 'w1',
      scope === 'window' ? 'other' : 'main',
    ),
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Design palette', exact: true })).toBeNull();
  view.rerender(tree('returned'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('applies both functional menu updates within one event to the latest state', () => {
  render(tree('shell'));
  fireEvent.click(screen.getByRole('button', { name: 'Toggle twice', exact: true }));
  expect(screen.queryByRole('button', { name: 'Design palette', exact: true })).toBeNull();
  openPalette();
  fireEvent.click(screen.getByRole('button', { name: 'Toggle twice', exact: true }));
  expect(screen.getByRole('button', { name: 'Design palette', exact: true })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
});
