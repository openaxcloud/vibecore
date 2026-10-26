/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectCardMenu } from './ProjectCardMenu';
import { Dropdown, DropdownItem } from '~/components/ui/Dropdown';
import { createI18nInstance } from '~/lib/i18n/runtime';

const submit = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useFetcher: () => ({ state: 'idle', data: undefined, submit }),
}));
afterEach(() => {
  cleanup();
  submit.mockClear();
});

it('opens the project menu without locking page scroll and restores focus on Escape', async () => {
  render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <ProjectCardMenu project={{ id: 'synthetic-project', name: 'Example', lifecycle: 'draft' }} onRename={vi.fn()} />
    </I18nextProvider>,
  );

  const trigger = screen.getByRole('button', { name: 'Project actions for Example' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });

  /*
   * jsdom has no layout: Floating UI may hide the zero-sized reference.
   * The separate browser recipe verifies visibility; this test checks scroll-lock and focus behavior.
   */
  const menu = await waitFor(() => {
    const element = document.querySelector('[role="menu"]');
    expect(element).not.toBeNull();

    return element!;
  });
  expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
  expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(4);
  fireEvent.keyDown(menu, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
  expect(submit).not.toHaveBeenCalled();
});

it('keeps existing dropdowns modal unless they opt out', async () => {
  render(
    <Dropdown trigger={<button>Default menu</button>}>
      <DropdownItem>Entry</DropdownItem>
    </Dropdown>,
  );

  const trigger = screen.getByRole('button', { name: 'Default menu' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  await screen.findByRole('menu');
  expect(document.body.getAttribute('data-scroll-locked')).toBe('1');
});

it('keeps rename and destructive confirmation available without submitting either action', async () => {
  const onRename = vi.fn();
  render(
    <I18nextProvider i18n={createI18nInstance('en')}>
      <ProjectCardMenu
        project={{ id: 'synthetic-project', name: 'Example', lifecycle: 'deployed', deploymentCount: 1 }}
        onRename={onRename}
      />
    </I18nextProvider>,
  );

  const trigger = screen.getByRole('button', { name: 'Project actions for Example' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByText('Rename', { exact: true }));
  expect(onRename).toHaveBeenCalledOnce();
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByText('Delete', { exact: true }));
  await screen.findByRole('dialog');
  expect((screen.getByRole('button', { name: 'Delete project' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(submit).not.toHaveBeenCalled();
});
