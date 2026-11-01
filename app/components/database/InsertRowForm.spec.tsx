/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InsertRowForm, hasInsertMetadata } from './InsertRowForm';

const fetcher = { state: 'idle', data: undefined as unknown, submit: vi.fn() };
vi.mock('react-router', () => ({ useFetcher: () => fetcher }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));

const column = { nom: 'amount', type: 'numeric', nullable: true, identity: false, generated: false, hasDefault: false };
beforeEach(() => {
  fetcher.state = 'idle';
  fetcher.data = undefined;
  fetcher.submit.mockReset();
});
afterEach(cleanup);

function setup() {
  const props = {
    projectId: 'p',
    connectionKey: 'DB',
    table: { schema: 's', nom: 't' },
    columns: [
      { ...column, nom: 'id', identity: true },
      column,
      { ...column, nom: 'note', type: 'text', nullable: false },
      { ...column, nom: 'created', hasDefault: true },
    ],
    onInserted: vi.fn(),
    onClose: vi.fn(),
  };

  const view = render(<InsertRowForm key="p:DB:s:t" {...props} />);

  return { props, view, refresh: () => view.rerender(<InsertRowForm key="p:DB:s:t" {...props} />) };
}
describe('InsertRowForm', () => {
  it('sends exact strings and modes, omits generated columns and prevents duplicate synchronous submissions', () => {
    const { props, refresh } = setup();
    fireEvent.change(screen.getByLabelText('Value — amount'), { target: { value: '900719925474099312345.000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    fireEvent.submit(screen.getByRole('button', { name: 'Insert row' }).closest('form')!);
    expect(fetcher.submit).toHaveBeenCalledTimes(1);

    const [body, options] = fetcher.submit.mock.calls[0];
    expect(body.intent).toBe('insert-row');
    expect(body.connectionKey).toBe('DB');
    expect(body.schemaName).toBe('s');
    expect(body.tableName).toBe('t');
    expect(options.action).toBe('/api/projects/p/ide-panel/database');
    expect(JSON.parse(body.values)).toEqual([
      { column: 'amount', mode: 'value', value: '900719925474099312345.000001' },
      { column: 'note', mode: 'value', value: '' },
      { column: 'created', mode: 'default' },
    ]);
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    fetcher.data = { ok: true, result: { command: 'INSERT', rowCount: 1 } };
    refresh();
    refresh();
    expect(props.onInserted).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
  it('uses explicit NULL only for nullable fields and retains raw value when changing modes', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Value — amount'), { target: { value: '123.450' } });
    fireEvent.change(screen.getByLabelText('Input mode — amount'), { target: { value: 'null' } });
    expect(screen.queryByLabelText('Value — amount')).toBeNull();
    fireEvent.change(screen.getByLabelText('Input mode — amount'), { target: { value: 'value' } });
    expect((screen.getByLabelText('Value — amount') as HTMLInputElement).value).toBe('123.450');
    expect(screen.getByLabelText('Input mode — note').querySelector('option[value="null"]')).toBeNull();
  });
  it.each([
    { ok: true, result: { command: 'INSERT', rowCount: 0 } },
    { ok: true, result: { command: 'UPDATE', rowCount: 1 } },
    { ok: false, error: 'secret connection details' },
  ])('does not claim unconfirmed insertion and keeps draft', (response) => {
    const { props, refresh } = setup();
    fireEvent.change(screen.getByLabelText('Value — amount'), { target: { value: 'invalid numeric' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    fetcher.data = response;
    refresh();
    expect(props.onInserted).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('did not confirm');
    expect(document.body.textContent).not.toContain('secret connection details');
    expect((screen.getByLabelText('Value — amount') as HTMLInputElement).value).toBe('invalid numeric');
    expect(fetcher.submit).toHaveBeenCalledTimes(1);
  });
  it.each(['connection', 'table', 'project'])('does not refresh another scope after %s remount', (scope) => {
    const { props, view } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));

    const next = {
      ...props,
      ...(scope === 'connection'
        ? { connectionKey: 'OTHER' }
        : scope === 'project'
          ? { projectId: 'other' }
          : { table: { schema: 's', nom: 'other' } }),
      onInserted: vi.fn(),
    };
    view.rerender(<InsertRowForm key="new-scope" {...next} />);
    fetcher.data = { ok: true, result: { command: 'INSERT', rowCount: 1 } };
    view.rerender(<InsertRowForm key="new-scope" {...next} />);
    expect(props.onInserted).not.toHaveBeenCalled();
    expect(next.onInserted).not.toHaveBeenCalled();
  });
  it('cancels without submitting and does not treat unknown metadata as false', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(fetcher.submit).not.toHaveBeenCalled();
    expect(hasInsertMetadata([{ nom: 'a', type: 'text' }])).toBe(false);
    expect(hasInsertMetadata([])).toBe(false);
    expect(hasInsertMetadata([column])).toBe(true);
  });
  it('reconciles new columns and invalid modes after refresh while retaining values', () => {
    const { props, view } = setup();
    fireEvent.change(screen.getByLabelText('Value — amount'), { target: { value: '123.450' } });
    fireEvent.change(screen.getByLabelText('Input mode — amount'), { target: { value: 'null' } });

    const updated = {
      ...props,
      columns: [
        ...props.columns.map((c) => ({ ...c, nullable: false, hasDefault: false })),
        { ...column, nom: 'new field', nullable: false },
      ],
    };
    view.rerender(<InsertRowForm key="p:DB:s:t" {...updated} />);
    expect((screen.getByLabelText('Value — amount') as HTMLInputElement).value).toBe('123.450');
    expect((screen.getByLabelText('Input mode — amount') as HTMLSelectElement).value).toBe('value');
    expect((screen.getByLabelText('Input mode — created') as HTMLSelectElement).value).toBe('value');
    expect(screen.getByLabelText('Value — new field')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    expect(JSON.parse(fetcher.submit.mock.calls[0][0].values)).toEqual([
      { column: 'amount', mode: 'value', value: '123.450' },
      { column: 'note', mode: 'value', value: '' },
      { column: 'created', mode: 'value', value: '' },
      { column: 'new field', mode: 'value', value: '' },
    ]);
  });
  it('does not replay a pending insertion when metadata changes and preserves draft on failure', () => {
    const { props, view } = setup();
    fireEvent.change(screen.getByLabelText('Value — amount'), { target: { value: '99.001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    fetcher.state = 'submitting';

    const updated = { ...props, columns: [...props.columns, { ...column, nom: 'added' }] };
    view.rerender(<InsertRowForm key="p:DB:s:t" {...updated} />);
    expect(screen.getByLabelText('Value — added')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
    expect(fetcher.submit).toHaveBeenCalledTimes(1);
    fetcher.state = 'idle';
    fetcher.data = { ok: false };
    view.rerender(<InsertRowForm key="p:DB:s:t" {...updated} />);
    expect((screen.getByLabelText('Value — amount') as HTMLInputElement).value).toBe('99.001');
    expect((screen.getByRole('button', { name: 'Insert row' }) as HTMLButtonElement).disabled).toBe(false);
    expect(props.onInserted).not.toHaveBeenCalled();
  });
  it('keeps boolean false distinct from NULL and uses date controls without number conversion', () => {
    const { props, view } = setup();

    const typed = {
      ...props,
      columns: [
        { ...column, nom: 'enabled', type: 'boolean' },
        { ...column, nom: 'date', type: 'date' },
        { ...column, nom: 'time', type: 'timestamp' },
      ],
    };
    view.rerender(<InsertRowForm key="typed" {...typed} />);
    fireEvent.change(screen.getByLabelText('Value — enabled'), { target: { value: 'false' } });
    expect((screen.getByLabelText('Value — date') as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('Value — time') as HTMLInputElement).type).toBe('datetime-local');
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    expect(JSON.parse(fetcher.submit.mock.calls[0][0].values)[0]).toEqual({
      column: 'enabled',
      mode: 'value',
      value: 'false',
    });
    fetcher.data = { ok: false };
    view.rerender(<InsertRowForm key="typed" {...typed} />);
    fireEvent.change(screen.getByLabelText('Input mode — enabled'), { target: { value: 'null' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    expect(JSON.parse(fetcher.submit.mock.calls[1][0].values)[0]).toEqual({ column: 'enabled', mode: 'null' });
  });
  it('adds prototype-named columns safely during metadata refresh and preserves their exact JSON values', () => {
    const { props, view } = setup();

    const updated = {
      ...props,
      columns: [...props.columns, ...['__proto__', 'constructor'].map((nom) => ({ ...column, nom, type: 'text' }))],
    };
    view.rerender(<InsertRowForm key="p:DB:s:t" {...updated} />);

    for (const name of ['__proto__', 'constructor']) {
      expect((screen.getByLabelText(`Input mode — ${name}`) as HTMLSelectElement).value).toBe('value');
      fireEvent.change(screen.getByLabelText(`Value — ${name}`), { target: { value: `exact ${name}` } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));

    const values = JSON.parse(fetcher.submit.mock.calls[0][0].values);

    for (const name of ['__proto__', 'constructor']) {
      expect(Object.hasOwn(values, name)).toBe(false);
      expect(values.filter((entry: { column: string }) => entry.column === name)).toEqual([
        { column: name, mode: 'value', value: `exact ${name}` },
      ]);
    }
    expect(Array.isArray(values)).toBe(true);
    expect(Object.hasOwn(Object.prototype, 'mode')).toBe(false);
    expect(Object.hasOwn(Object.prototype, 'value')).toBe(false);
  });
  it('preserves timezone offsets exactly rather than using a local datetime control', () => {
    const { props, view } = setup();
    view.rerender(
      <InsertRowForm
        key="timezone"
        {...props}
        columns={[{ ...column, nom: 'at', type: 'timestamp with time zone' }]}
      />,
    );

    const input = screen.getByLabelText('Value — at', { exact: true }) as HTMLInputElement;
    expect(input.type).toBe('text');
    fireEvent.change(input, { target: { value: '2026-11-01T12:34:56+02:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Insert row' }));
    expect(JSON.parse(fetcher.submit.mock.calls[0][0].values)[0]).toEqual({
      column: 'at',
      mode: 'value',
      value: '2026-11-01T12:34:56+02:00',
    });
  });
  it('shows loading rather than a false schema error, then distinguishes confirmation from failure', () => {
    const { props, view } = setup();
    fireEvent.change(screen.getByLabelText('Value — amount'), { target: { value: '12.34' } });
    view.rerender(<InsertRowForm key="p:DB:s:t" {...props} metadataConfirmed={false} metadataLoading />);
    expect(screen.getByRole('status').textContent).toBe('Loading schema…');
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Insert row' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<InsertRowForm key="p:DB:s:t" {...props} metadataConfirmed />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect((screen.getByRole('button', { name: 'Insert row' }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByLabelText('Value — amount') as HTMLInputElement).value).toBe('12.34');
    view.rerender(<InsertRowForm key="p:DB:s:t" {...props} metadataConfirmed={false} />);
    expect(screen.getByRole('alert').textContent).toContain('complete PostgreSQL');
    expect((screen.getByLabelText('Value — amount') as HTMLInputElement).value).toBe('12.34');
  });
});
