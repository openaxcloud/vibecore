/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Request as FetchRequest } from 'node-fetch';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DatabaseStudio } from './DatabaseStudio';

vi.stubGlobal('Request', FetchRequest);

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
vi.mock('~/components/ui/Dialog', () => ({
  ConfirmationDialog: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) =>
    isOpen ? <button onClick={onConfirm}>Confirm update</button> : null,
}));

const schema = (primary = true) => ({
  schema: {
    tables: [{ table_schema: 'private', table_name: 'Order Items' }],
    columns: [
      {
        table_schema: 'private',
        table_name: 'Order Items',
        column_name: 'id',
        is_primary_key: primary,
        data_type: 'integer',
      },
      { table_schema: 'private', table_name: 'Order Items', column_name: 'Name', data_type: 'text' },
    ],
  },
});

function mount(primary = true, action?: () => Promise<unknown>) {
  const queries: FormData[] = [];
  const loads: string[] = [];

  const router = createMemoryRouter([
    {
      path: '/',
      element: <DatabaseStudio projectId="a" connexionFournie="DATABASE_URL" schemaFourni={schema(primary)} />,
    },
    {
      path: '/api/projects/:id/ide-panel/database',
      loader: ({ request }) => {
        loads.push(request.url);
        return request.url.includes('schemaKey')
          ? { schema: { tables: [] } }
          : {
              connections: [
                { key: 'DATABASE_URL', kind: 'postgres' },
                { key: 'PROD_DATABASE_URL', kind: 'postgres' },
              ],
            };
      },
      action: async ({ request }) => {
        queries.push(await request.formData());
        return action ? action() : { ok: true, result: { columns: ['id', 'Name'], rows: [[1, 'first']], rowCount: 1 } };
      },
    },
  ]);
  render(<RouterProvider router={router} />);

  return { queries, loads };
}

afterEach(cleanup);

describe('DatabaseStudio request and row safety', () => {
  it('creates a table without SQL input and refreshes its schema only after confirmation', async () => {
    const { queries, loads } = mount(true, async () => ({ ok: true, result: { command: 'CREATE' } }));
    fireEvent.click(await screen.findByTestId('studio-create-table'));
    fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'Contacts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create table', exact: true }));
    await screen.findByText('Table created.');
    expect(queries).toHaveLength(1);
    expect(queries[0].get('connectionKey')).toBe('DATABASE_URL');
    expect(queries[0].get('query')).toContain('CREATE TABLE "public"."Contacts"');
    await waitFor(() => expect(loads.some((url) => url.includes('schemaKey=DATABASE_URL'))).toBe(true));
  });

  it('does not apply a pending creation response to a newly selected connection', async () => {
    let finish!: (result: unknown) => void;

    const { queries, loads } = mount(
      true,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(await screen.findByTestId('studio-create-table'));
    fireEvent.change(screen.getByLabelText('Table name'), { target: { value: 'Contacts' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create table', exact: true }));
    await waitFor(() => expect(queries).toHaveLength(1));
    fireEvent.change(screen.getByRole('combobox', { name: 'Connection' }), { target: { value: 'PROD_DATABASE_URL' } });
    await waitFor(() => expect(loads.some((url) => url.includes('schemaKey=PROD_DATABASE_URL'))).toBe(true));
    finish({ ok: true });
    await waitFor(() => expect(screen.queryByText('Creating table…')).toBeNull());
    expect(screen.queryByText('Table created.')).toBeNull();
    expect(screen.queryByLabelText('Table name')).toBeNull();
    expect(loads.filter((url) => url.includes('schemaKey=DATABASE_URL'))).toHaveLength(0);
  });

  it('quotes schema/table/columns and updates only the primary-key row', async () => {
    const { queries } = mount();
    fireEvent.click(screen.getByTestId('studio-table'));
    await screen.findByText('first');
    expect(queries[0].get('query')).toBe('SELECT * FROM "private"."Order Items" LIMIT 50 OFFSET 0;');
    fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true }));
    fireEvent.blur(screen.getByDisplayValue('first'), { target: { value: 'updated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm update' }));
    await waitFor(() => expect(queries).toHaveLength(2));
    expect(queries[1].get('query')).toBe('UPDATE "private"."Order Items" SET "Name" = E\'updated\' WHERE "id" = 1;');
  });

  it('does not offer editing without a stable row identity', async () => {
    mount(false);
    fireEvent.click(screen.getByTestId('studio-table'));
    await screen.findByText('first');
    expect((screen.getByRole('button', { name: 'Edit', exact: true }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('discards prior rows, table, supplied schema, and confirmation on connection switch', async () => {
    const { queries, loads } = mount();
    fireEvent.click(screen.getByTestId('studio-table'));
    await screen.findByText('first');
    await screen.findByRole('option', { name: 'PROD_DATABASE_URL' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'PROD_DATABASE_URL' } });
    await waitFor(() => expect(loads.some((url) => url.includes('schemaKey=PROD_DATABASE_URL'))).toBe(true));
    expect(screen.queryByText('first')).toBeNull();
    expect(screen.queryByTestId('studio-table')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull();
    expect(queries).toHaveLength(1);
  });

  it('prevents arbitrary query results from inheriting a table edit target', async () => {
    mount();
    fireEvent.click(screen.getByTestId('studio-table'));
    await screen.findByText('first');
    fireEvent.change(screen.getByRole('textbox', { name: 'SQL query' }), { target: { value: 'SELECT 1;' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Edit', exact: true })).toBeNull());
  });

  it('does not submit again via keyboard while a query is pending', async () => {
    let finish!: (result: unknown) => void;

    const { queries } = mount(
      true,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run', exact: true }));
    await waitFor(() => expect(queries).toHaveLength(1));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'SQL query' }), { key: 'Enter', ctrlKey: true });
    expect(queries).toHaveLength(1);
    finish({ ok: true, result: { columns: [], rows: [], rowCount: 1, command: 'UPDATE' } });
    await screen.findByText('1 row(s) changed');
  });
});

it('opens the PostgreSQL row form and refreshes exactly its qualified table after insertion', async () => {
  const calls: FormData[] = [];
  const complete = schema();

  const enriched = {
    schema: {
      ...complete.schema,
      columns: complete.schema.columns.map((c) => ({
        ...c,
        is_nullable: 'NO',
        is_identity: c.column_name === 'id' ? 'YES' : 'NO',
        is_generated: 'NEVER',
        has_default: false,
      })),
    },
  };
  const router = createMemoryRouter([
    { path: '/', element: <DatabaseStudio projectId="p" connexionFournie="DB" schemaFourni={enriched} /> },
    {
      path: '/api/projects/:id/ide-panel/database',
      loader: ({ request }) =>
        request.url.includes('schemaKey') ? enriched : { connections: [{ key: 'DB', kind: 'postgres' }] },
      action: async ({ request }) => {
        const body = await request.formData();
        calls.push(body);

        return body.get('intent') === 'insert-row'
          ? { ok: true, result: { command: 'INSERT', rowCount: 1 } }
          : { ok: true, result: { columns: ['id', 'Name'], rows: [], rowCount: 0 } };
      },
    },
  ]);
  render(<RouterProvider router={router} />);
  fireEvent.click(await screen.findByTestId('studio-table'));
  fireEvent.click(await screen.findByRole('button', { name: '+ Insert row' }));
  await screen.findByLabelText('Value — Name');
  fireEvent.click(screen.getByTestId('studio-create-table'));
  expect(await screen.findByLabelText('Table name')).toBeTruthy();
  expect(screen.queryByLabelText('Value — Name')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel', exact: true }));
  expect(screen.queryByLabelText('Table name')).toBeNull();
  fireEvent.click(screen.getByTestId('studio-create-table'));
  fireEvent.click(screen.getByTestId('studio-table'));
  await waitFor(() => expect(screen.queryByLabelText('Table name')).toBeNull());
  fireEvent.click(await screen.findByRole('button', { name: '+ Insert row' }));
  fireEvent.change(await screen.findByLabelText('Value — Name'), { target: { value: 'exact row' } });
  fireEvent.click(screen.getByRole('button', { name: 'Insert row', exact: true }));
  await screen.findByText('Row inserted.');
  await waitFor(() => expect(calls).toHaveLength(4));
  expect(calls[2].get('intent')).toBe('insert-row');
  expect(calls[2].get('schemaName')).toBe('private');
  expect(calls[2].get('tableName')).toBe('Order Items');
  expect(calls[3].get('query')).toBe('SELECT * FROM "private"."Order Items" LIMIT 50 OFFSET 0;');
});

it.each(['error', 'unknown', 'deleted'])(
  'keeps the insertion draft through %s schema refresh and recovers without changing scope',
  async (failure) => {
    const complete = schema();

    const enriched = {
      schema: {
        ...complete.schema,
        columns: complete.schema.columns.map((c) => ({
          ...c,
          is_nullable: 'NO',
          is_identity: c.column_name === 'id' ? 'YES' : 'NO',
          is_generated: 'NEVER',
          has_default: false,
        })),
      },
    };

    let failRefresh = true;
    let schemaLoads = 0;

    const router = createMemoryRouter([
      { path: '/', element: <DatabaseStudio projectId="p" connexionFournie="DB" schemaFourni={enriched} /> },
      {
        path: '/api/projects/:id/ide-panel/database',
        loader: ({ request }) => {
          if (!request.url.includes('schemaKey')) {
            return { connections: [{ key: 'DB', kind: 'postgres' }] };
          }

          schemaLoads++;

          if (!failRefresh) {
            return enriched;
          }

          return failure === 'error'
            ? { ok: false, error: 'unavailable' }
            : failure === 'unknown'
              ? complete
              : { schema: { tables: [], columns: [] } };
        },
        action: () => ({ ok: true, result: { columns: ['id', 'Name'], rows: [], rowCount: 0 } }),
      },
    ]);
    render(<RouterProvider router={router} />);
    fireEvent.click(await screen.findByTestId('studio-table'));
    fireEvent.click(await screen.findByRole('button', { name: '+ Insert row' }));
    fireEvent.change(await screen.findByLabelText('Value — Name'), { target: { value: 'keep exact draft' } });

    const refreshControl = screen.getByRole('button', { name: 'Refresh schema', exact: true });
    fireEvent.click(refreshControl);
    await waitFor(() => expect(schemaLoads).toBe(1));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Insert row', exact: true }) as HTMLButtonElement).disabled).toBe(
        true,
      ),
    );
    expect((screen.getByLabelText('Value — Name') as HTMLInputElement).value).toBe('keep exact draft');
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
    failRefresh = false;
    fireEvent.click(refreshControl);
    await waitFor(() => expect(schemaLoads).toBe(2));
    await waitFor(() =>
      expect((screen.getByRole('button', { name: 'Insert row', exact: true }) as HTMLButtonElement).disabled).toBe(
        false,
      ),
    );
    expect((screen.getByLabelText('Value — Name') as HTMLInputElement).value).toBe('keep exact draft');
  },
);
