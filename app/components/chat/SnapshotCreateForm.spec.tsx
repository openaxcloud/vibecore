/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IdeSettingsDraftProvider } from './IdeSettingsDraftState';
import { SnapshotCreateForm, type SnapshotReceipt } from './SnapshotCreateForm';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(cleanup);

function fixture(
  surface: string,
  snapshots: readonly SnapshotReceipt[],
  onSubmit = vi.fn((event) => event.preventDefault()),
  projectId = 'p1',
  busy = false,
  paneId = 'pane-main',
) {
  return (
    <IdeSettingsDraftProvider projectId={projectId}>
      <SnapshotCreateForm
        key={surface}
        projectId={projectId}
        paneId={paneId}
        snapshots={snapshots}
        onSubmit={onSubmit}
        busy={busy}
      />
    </IdeSettingsDraftProvider>
  );
}

it('keeps a typed label through same-surface refresh and replacement, and submits the exact label', () => {
  const onSubmit = vi.fn((event) => {
    event.preventDefault();
    expect(new FormData(event.currentTarget).get('label')).toBe('Exact checkpoint');
    expect(new FormData(event.currentTarget).get('intent')).toBe('create');
  });

  const view = render(fixture('desktop', [], onSubmit));
  const input = () => view.container.querySelector<HTMLInputElement>('input[name="label"]')!;
  fireEvent.change(input(), { target: { value: 'Exact checkpoint' } });
  view.rerender(fixture('desktop', [{ id: 'old', label: 'Old' }], onSubmit));
  expect(input().value).toBe('Exact checkpoint');
  view.rerender(fixture('restored-pane', [{ id: 'old', label: 'Old' }], onSubmit));
  expect(input().value).toBe('Exact checkpoint');
  fireEvent.submit(input().closest('form')!);
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('does not clear on stale refresh, failed submission or an existing matching label; clears on a new server receipt', () => {
  const old = [{ id: 'old', label: 'Same label' }];
  const view = render(fixture('desktop', old));
  const input = () => view.container.querySelector<HTMLInputElement>('input[name="label"]')!;
  fireEvent.change(input(), { target: { value: 'Same label' } });
  fireEvent.submit(input().closest('form')!);
  view.rerender(fixture('desktop', [...old]));
  expect(input().value).toBe('Same label');
  view.rerender(fixture('desktop', [...old, { id: 'new', label: 'Same label' }]));
  expect(input().value).toBe('');
});

it('keeps a newer draft when an earlier creation is confirmed', () => {
  const view = render(fixture('desktop', []));
  const input = () => view.container.querySelector<HTMLInputElement>('input[name="label"]')!;
  fireEvent.change(input(), { target: { value: 'Submitted' } });
  fireEvent.submit(input().closest('form')!);
  fireEvent.change(input(), { target: { value: 'Newer unsent label' } });
  view.rerender(fixture('desktop', [{ id: 'created', label: 'Submitted' }]));
  expect(input().value).toBe('Newer unsent label');
});

it('isolates projects and retains a draft after the parent resets the HTML form', () => {
  const onSubmit = vi.fn((event) => {
    event.preventDefault();
    event.currentTarget.reset();
  });

  const view = render(fixture('desktop', [], onSubmit));
  const input = () => view.container.querySelector<HTMLInputElement>('input[name="label"]')!;
  fireEvent.change(input(), { target: { value: 'Pending receipt' } });
  fireEvent.submit(input().closest('form')!);
  view.rerender(fixture('desktop', [], onSubmit));
  expect(input().value).toBe('Pending receipt');
  view.rerender(fixture('desktop', [], onSubmit, 'p2'));
  expect(input().value).toBe('');
});

it('conservatively retains text after an in-flight submission surface is replaced, without resubmitting', () => {
  const onSubmit = vi.fn((event) => event.preventDefault());
  const view = render(fixture('desktop', [], onSubmit));
  const input = () => view.container.querySelector<HTMLInputElement>('input[name="label"]')!;
  fireEvent.change(input(), { target: { value: 'In flight' } });
  fireEvent.submit(input().closest('form')!);
  view.rerender(fixture('replaced', [], onSubmit));
  view.rerender(fixture('replaced', [{ id: 'confirmed', label: 'In flight' }], onSubmit));
  expect(input().value).toBe('In flight');
  expect(onSubmit).toHaveBeenCalledOnce();
});

it('isolates pane drafts and does not use another pane receipt to clear its text', () => {
  const onSubmit = vi.fn((event) => event.preventDefault());
  const view = render(fixture('desktop', [], onSubmit));
  const input = () => view.container.querySelector<HTMLInputElement>('input[name="label"]')!;
  fireEvent.change(input(), { target: { value: 'Pane one draft' } });
  fireEvent.submit(input().closest('form')!);
  view.rerender(fixture('desktop', [], onSubmit, 'p1', false, 'pane-two'));
  expect(input().value).toBe('');
  fireEvent.change(input(), { target: { value: 'Pane two draft' } });
  view.rerender(fixture('desktop', [{ id: 'other', label: 'Pane one draft' }], onSubmit, 'p1', false, 'pane-two'));
  expect(input().value).toBe('Pane two draft');
  view.rerender(fixture('desktop', [], onSubmit));
  expect(input().value).toBe('Pane one draft');
});
