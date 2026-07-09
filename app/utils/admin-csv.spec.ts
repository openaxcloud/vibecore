import { describe, expect, it } from 'vitest';

import { rowsToCsv } from './admin-csv';

describe('rowsToCsv (F24 account-deletions export shape)', () => {
  const columns = ['userId', 'email', 'status', 'requestedAt', 'purgeDueAt'];

  it('emits a header row then one row per record in column order', () => {
    const csv = rowsToCsv(
      [
        {
          userId: 'u1',
          email: 'a@example.com',
          status: 'grace_period',
          requestedAt: '2026-07-01T00:00:00.000Z',
          purgeDueAt: '2026-07-15T00:00:00.000Z',
        },
      ],
      columns,
    );

    const lines = csv.split('\n');
    expect(lines[0]).toBe('userId,email,status,requestedAt,purgeDueAt');
    expect(lines[1]).toBe('"u1","a@example.com","grace_period","2026-07-01T00:00:00.000Z","2026-07-15T00:00:00.000Z"');
  });

  it('renders missing/null cells as empty quoted fields', () => {
    const csv = rowsToCsv([{ userId: 'u2', email: null, status: 'ready_to_purge' }], columns);
    expect(csv.split('\n')[1]).toBe('"u2","","ready_to_purge","",""');
  });

  it('escapes embedded quotes and preserves commas', () => {
    const csv = rowsToCsv([{ userId: 'u3', email: 'a,"b"@x.com', status: 'purged' }], columns);
    expect(csv.split('\n')[1]).toBe('"u3","a,""b""@x.com","purged","",""');
  });

  it('produces only a header row for an empty queue', () => {
    expect(rowsToCsv([], columns)).toBe('userId,email,status,requestedAt,purgeDueAt');
  });
});
