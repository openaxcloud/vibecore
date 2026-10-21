/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AgentHeaderMenu, AgentMenuProvider } from './AgentHeaderMenu';

afterEach(cleanup);

function tree(instance: string, projectId = 'p1', workspaceId = 'w1', windowId = 'main') {
  return (
    <AgentMenuProvider projectId={projectId} workspaceId={workspaceId} windowId={windowId}>
      <AgentHeaderMenu key={instance} label="Actions">
        <button>First</button>
        <button>Last</button>
      </AgentHeaderMenu>
    </AgentMenuProvider>
  );
}

it('keeps the menu and focused action through actual shell replacement, then restores focus on Escape', () => {
  const view = render(tree('shell'));
  fireEvent.click(view.getByRole('button', { name: 'Actions' }));
  fireEvent.keyDown(view.getByRole('menu'), { key: 'End' });

  const oldMenu = view.getByRole('menu');
  expect(document.activeElement).toBe(view.getByText('Last'));
  view.rerender(tree('chat'));
  expect(oldMenu.isConnected).toBe(false);
  expect(view.getByRole('menu')).toBeTruthy();
  expect(document.activeElement).toBe(view.getByText('Last'));
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(view.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(view.getByRole('button', { name: 'Actions' }));
});

it('does not reopen a menu explicitly closed before replacement', () => {
  const view = render(tree('shell'));
  fireEvent.click(view.getByRole('button', { name: 'Actions' }));
  fireEvent.keyDown(window, { key: 'Escape' });
  view.rerender(tree('chat'));
  expect(view.queryByRole('menu')).toBeNull();
});

it.each(['project', 'workspace', 'window'])('drops state when leaving the %s scope and returning', (scope) => {
  const view = render(tree('shell'));
  fireEvent.click(view.getByRole('button', { name: 'Actions' }));
  view.rerender(
    tree(
      'chat',
      scope === 'project' ? 'p2' : 'p1',
      scope === 'workspace' ? 'w2' : 'w1',
      scope === 'window' ? 'second' : 'main',
    ),
  );
  expect(view.queryByRole('menu')).toBeNull();
  view.rerender(tree('returned'));
  expect(view.queryByRole('menu')).toBeNull();
});
