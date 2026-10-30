/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDeploymentSubmit } from './useDeploymentSubmit';
import { useKeybindings } from '~/lib/hooks/useKeybindings';

afterEach(cleanup);

function Harness({ onSubmit, scope = 'a' }: { onSubmit: (form: FormData) => void; scope?: string }) {
  useKeybindings({
    bindings: [{ combo: 'escape', action: 'overlay.close', label: 'Close overlay', description: '', category: 'Help' }],
    getContext: () => ({}),
    runAction: () => undefined,
  });

  const { submit, confirmation } = useDeploymentSubmit(onSubmit, false, 'en', scope);

  return (
    <>
      {confirmation}
      <form onSubmit={submit}>
        <input type="hidden" name="intent" value="rollback" />
        <input type="hidden" name="deploymentId" value={`ready-target-${scope}`} />
        <button type="submit">Restore release</button>
      </form>
    </>
  );
}
describe('shared deployment confirmation', () => {
  it('does not send a rollback before confirmation and allows cancelling then retrying', async () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));

    const confirm = screen.getByRole('button', { name: /roll.?back|restore/i });
    await act(async () => {
      fireEvent.click(confirm);
      fireEvent.click(confirm);
    });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect((onSubmit.mock.calls[0][0] as FormData).get('deploymentId')).toBe('ready-target-a');
  });
  it('drops a pending confirmation when the project/workspace changes', () => {
    const oldSubmit = vi.fn();
    const newSubmit = vi.fn();
    const { rerender } = render(<Harness onSubmit={oldSubmit} scope="project-a:workspace-a" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    rerender(<Harness onSubmit={newSubmit} scope="project-b:workspace-b" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(oldSubmit).not.toHaveBeenCalled();
    expect(newSubmit).not.toHaveBeenCalled();
  });
  it('allows Escape without sending or leaving the confirmation locked', () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});

it('does not restore an old rollback confirmation after A to B to A', async () => {
  const onSubmit = vi.fn();
  const view = render(<Harness onSubmit={onSubmit} scope="a" />);
  fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
  view.rerender(<Harness onSubmit={onSubmit} scope="b" />);
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
  view.rerender(<Harness onSubmit={onSubmit} scope="a" />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Restore release' }));
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /roll.?back|restore/i }));
  });
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect((onSubmit.mock.calls[0][0] as FormData).get('deploymentId')).toBe('ready-target-a');
});
