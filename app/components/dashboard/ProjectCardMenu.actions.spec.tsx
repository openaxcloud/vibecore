/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectCardMenu, ProjectRenameForm } from './ProjectCardMenu';
import { createI18nInstance } from '~/lib/i18n/runtime';

const harness = vi.hoisted(() => ({
  fetcher: {
    state: 'idle' as 'idle' | 'submitting' | 'loading',
    data: undefined as { ok?: boolean; error?: string } | undefined,
    submit: vi.fn(),
  },
  toast: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('react-router', async (original) => ({
  ...(await original<typeof import('react-router')>()),
  useFetcher: () => harness.fetcher,
}));
vi.mock('react-toastify', () => ({
  toast: Object.assign(harness.toast, { success: harness.success, error: harness.error }),
}));

const project = { id: 'isolated-project', name: 'Example', lifecycle: 'deployed' as const, deploymentCount: 1 };
const action = { method: 'post', action: '/api/projects/isolated-project/project-action' };

beforeEach(() => {
  harness.fetcher.state = 'idle';
  harness.fetcher.data = undefined;
  vi.clearAllMocks();
  harness.fetcher.submit.mockReset();
});
afterEach(cleanup);

function menu(deploymentCount = 1) {
  const i18n = createI18nInstance('en');
  const onRename = vi.fn();

  const element = () => (
    <I18nextProvider i18n={i18n}>
      <ProjectCardMenu project={{ ...project, deploymentCount }} onRename={onRename} />
    </I18nextProvider>
  );

  const view = render(element());

  return { ...view, refresh: () => view.rerender(element()), onRename };
}

function rename() {
  const i18n = createI18nInstance('en');
  const onDone = vi.fn();

  const element = (done = onDone) => (
    <I18nextProvider i18n={i18n}>
      <ProjectRenameForm project={project} onDone={done} />
    </I18nextProvider>
  );

  const view = render(element());

  return { ...view, refresh: (done = onDone) => view.rerender(element(done)), onDone };
}

async function openMenu() {
  const trigger = screen.getByRole('button', { name: 'Project actions for Example' });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'Enter' });

  // jsdom has no reference geometry; this checks real Radix behavior, not layout.
  await waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull());
}

async function select(label: string) {
  await openMenu();
  fireEvent.click(await screen.findByText(label, { exact: true }));
}

function enterName(name = 'New name') {
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: name } });
  fireEvent.keyDown(input, { key: 'Enter' });

  return input;
}

describe('project menu mutation lifecycle', () => {
  it.each(['submitting', 'loading'] as const)('disables new actions while %s', (state) => {
    harness.fetcher.state = state;
    menu();
    expect((screen.getByRole('button', { name: 'Project actions for Example' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(harness.fetcher.submit).not.toHaveBeenCalled();
  });

  it('guards an action from an already-open menu if a request becomes pending', async () => {
    const view = menu();
    await openMenu();

    const duplicate = await screen.findByText('Duplicate', { exact: true });
    harness.fetcher.state = 'submitting';
    view.refresh();
    fireEvent.click(duplicate);
    expect(harness.fetcher.submit).not.toHaveBeenCalled();
  });

  it('locks immediately, keeps the lock through revalidation, and reports the new result once', async () => {
    const view = menu();
    await select('Duplicate');
    expect(harness.fetcher.submit).toHaveBeenCalledWith({ intent: 'duplicate', name: 'Example Copy' }, action);
    expect((screen.getByRole('button', { name: 'Project actions for Example' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    harness.fetcher.state = 'loading';
    harness.fetcher.data = { ok: true };
    view.refresh();
    expect(harness.success).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Project actions for Example' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    harness.fetcher.state = 'idle';
    view.refresh();
    expect((screen.getByRole('button', { name: 'Project actions for Example' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(harness.success).toHaveBeenCalledTimes(1);
  });

  it('does not reuse an earlier success when a fresh submission still retains old fetcher data', async () => {
    harness.fetcher.data = { ok: true };

    const view = menu();
    await select('Duplicate');
    view.refresh();
    expect(harness.success).not.toHaveBeenCalled();
    harness.fetcher.data = { ok: false, error: 'isolated failure' };
    view.refresh();
    expect(harness.error).toHaveBeenCalledTimes(1);
    expect(harness.success).not.toHaveBeenCalled();
  });

  it('emits the archive Undo toast before loader revalidation can remove the card', async () => {
    const view = menu();
    await select('Archive');
    harness.fetcher.state = 'loading';
    harness.fetcher.data = { ok: true };
    view.refresh();
    expect(harness.toast).toHaveBeenCalledWith(expect.any(Function), { autoClose: 5000 });
    view.unmount();
    expect(harness.toast).toHaveBeenCalledTimes(1);
  });

  it.each([0, 1])('transmits the confirmed name with deploymentCount=%s', async (deploymentCount) => {
    menu(deploymentCount);
    await select('Delete');
    await screen.findByRole('dialog');

    if (deploymentCount) {
      const confirm = screen.getByRole('button', { name: 'Delete project' }) as HTMLButtonElement;
      fireEvent.change(screen.getByRole('textbox'), { target: { value: ' Example ' } });
      expect(confirm.disabled).toBe(true);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Example' } });
    } else {
      expect(screen.queryByRole('textbox')).toBeNull();
    }

    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(harness.fetcher.submit).toHaveBeenCalledWith({ intent: 'delete-permanent', confirmName: 'Example' }, action);
  });

  it('keeps cancellation free of mutations even after the name was entered', async () => {
    menu();
    await select('Delete');
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Example' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(harness.fetcher.submit).not.toHaveBeenCalled();
  });
});

describe('project rename mutation lifecycle', () => {
  it('sends one request for Enter followed by blur and another Enter', () => {
    rename();

    const input = enterName();
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(harness.fetcher.submit).toHaveBeenCalledTimes(1);
    expect(harness.fetcher.submit).toHaveBeenCalledWith({ intent: 'rename', name: 'New name' }, action);
  });

  it('retains the draft on error, avoids repeated error toasts, and closes only after a successful retry', () => {
    const view = rename();
    enterName();
    harness.fetcher.data = { ok: false, error: 'isolated failure' };
    view.refresh();
    expect(view.onDone).not.toHaveBeenCalled();

    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('New name');
    expect(input.disabled).toBe(false);

    const anotherDone = vi.fn();
    view.refresh(anotherDone);
    expect(harness.error).toHaveBeenCalledTimes(1);
    expect(anotherDone).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: 'Corrected name' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    view.refresh(anotherDone);
    expect(harness.error).toHaveBeenCalledTimes(1);
    harness.fetcher.data = { ok: true };
    view.refresh(anotherDone);
    expect(anotherDone).toHaveBeenCalledTimes(1);
    expect(harness.fetcher.submit).toHaveBeenCalledTimes(2);
    expect(harness.fetcher.submit).toHaveBeenLastCalledWith({ intent: 'rename', name: 'Corrected name' }, action);
  });

  it('does not close or announce success until the successful action is idle', () => {
    const view = rename();
    enterName();
    harness.fetcher.state = 'loading';
    harness.fetcher.data = { ok: true };
    view.refresh();
    expect(view.onDone).not.toHaveBeenCalled();
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
    harness.fetcher.state = 'idle';
    view.refresh();
    expect(view.onDone).toHaveBeenCalledTimes(1);
  });

  it('does not submit a blur after Escape has cancelled editing', () => {
    const view = rename();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Discard this' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(view.onDone).toHaveBeenCalledTimes(1);
    expect(harness.fetcher.submit).not.toHaveBeenCalled();
  });

  it('closes unchanged or empty edits without a mutation', () => {
    const view = rename();
    enterName('  ');
    fireEvent.blur(screen.getByRole('textbox'));
    expect(view.onDone).toHaveBeenCalledTimes(1);
    expect(harness.fetcher.submit).not.toHaveBeenCalled();
  });
});
