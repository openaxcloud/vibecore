/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateTableForm } from './CreateTableForm';

const fetcher = {
  state: 'idle',
  data: undefined as { ok?: boolean; error?: string; result?: { error?: string; command?: string } } | undefined,
  submit: vi.fn(),
};
vi.mock('react-router', () => ({ useFetcher: () => fetcher }));

let language = 'en';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language } }) }));
beforeEach(() => {
  language = 'en';
  fetcher.state = 'idle';
  fetcher.data = undefined;
  fetcher.submit.mockReset();
});
afterEach(cleanup);

function setup() {
  const props = { projectId: 'project/a', connectionKey: 'DEV_URL', onCreated: vi.fn(), onCancel: vi.fn() };
  const view = render(<CreateTableForm {...props} />);
  fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'orders' } });

  return { props, refresh: () => view.rerender(<CreateTableForm {...props} />) };
}

describe('CreateTableForm explicit scoped request', () => {
  it('submits once to the current project/connection and refreshes once only after server success', () => {
    const { props, refresh } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Create table' }).closest('form')!);
    expect(fetcher.submit).toHaveBeenCalledTimes(1);
    expect(fetcher.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'query',
        connectionKey: 'DEV_URL',
        query: expect.stringContaining('CREATE TABLE "public"."orders"'),
      }),
      { method: 'post', action: '/api/projects/project%2Fa/ide-panel/database' },
    );
    expect(props.onCreated).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fetcher.state = 'submitting';
    refresh();
    fetcher.state = 'idle';
    fetcher.data = { ok: true, result: { command: 'CREATE' } };
    refresh();
    refresh();
    expect(props.onCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('Table created.');
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onCancel).toHaveBeenCalledOnce();
  });
  it('retains values but masks backend details without retry or success', () => {
    const { props, refresh } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    fetcher.state = 'loading';
    refresh();
    fetcher.state = 'idle';
    fetcher.data = { ok: false, error: 'permission denied for schema public' };
    refresh();
    expect(screen.getByRole('alert').textContent).toContain('Refresh and check the schema');
    expect(screen.queryByText('permission denied for schema public')).toBeNull();
    expect((screen.getByLabelText('Table name') as HTMLInputElement).value).toBe('orders');
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(fetcher.submit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });
  it('does not mistake stale fetcher success for completion of a new request', () => {
    fetcher.data = { ok: true, result: { command: 'CREATE' } };

    const { props, refresh } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    refresh();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('Creating');
    fetcher.state = 'loading';
    refresh();
    fetcher.state = 'idle';
    refresh();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('did not confirm');
  });
  it('does not claim creation from an incomplete success envelope', () => {
    const { props, refresh } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    fetcher.data = { ok: true };
    refresh();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('did not confirm');
  });
  it('adds/removes columns without submitting and blocks reserved names', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add column' }));
    fireEvent.change(screen.getByLabelText('Column name'), { target: { value: 'id' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    expect(screen.getByRole('alert').textContent).toContain('reserved');
    fireEvent.click(screen.getByRole('button', { name: 'Remove column 1' }));
    expect(screen.queryByLabelText('Column name')).toBeNull();
    expect(fetcher.submit).not.toHaveBeenCalled();
  });
  it('rejects nested execution errors even when the envelope says ok', () => {
    const { props, refresh } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    fetcher.data = { ok: true, result: { error: 'postgres://secret@host/database' } };
    refresh();
    expect(props.onCreated).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('did not confirm');
    expect(document.body.textContent).not.toContain('secret@host');
  });
  it('masks synchronous transport exceptions and permits explicit retry', () => {
    const { props } = setup();
    fetcher.submit.mockImplementationOnce(() => {
      throw new Error('credential=secret');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create table' }));
    expect(screen.getByRole('alert').textContent).toContain('Refresh and check');
    expect(document.body.textContent).not.toContain('credential=');
    expect(props.onCreated).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Create table' }) as HTMLButtonElement).disabled).toBe(false);
    expect(fetcher.submit).toHaveBeenCalledTimes(1);
  });
  it.each(['en', 'fr'])('uses plain column labels in %s while keeping SQL types', (locale) => {
    language = locale;
    render(<CreateTableForm projectId="p" connectionKey="DB" onCreated={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: locale === 'fr' ? 'Ajouter une colonne' : 'Add column' }));

    const option = screen.getByRole('option', {
      name: locale === 'fr' ? 'Nombre entier' : 'Whole number',
    }) as HTMLOptionElement;
    expect(screen.getByLabelText('Type', { exact: true }).tagName).toBe('SELECT');
    expect(option.value).toBe('integer');
    expect(
      screen.getByText(
        locale === 'fr'
          ? 'Un identifiant unique est ajouté automatiquement.'
          : 'A unique identifier is added automatically.',
      ),
    ).toBeTruthy();
  });
});
