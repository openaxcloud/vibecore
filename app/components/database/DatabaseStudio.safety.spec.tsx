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
