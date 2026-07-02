import { describe, expect, it } from 'vitest';
import { MAX_RECENT_COMMANDS, pushRecentCommand } from './recent-commands';

describe('pushRecentCommand', () => {
  it('prepends the newest destination', () => {
    expect(pushRecentCommand(['/usage'], '/projects/new')).toEqual(['/projects/new', '/usage']);
  });

  it('dedupes an already-recent destination by moving it to the front', () => {
    expect(pushRecentCommand(['/usage', '/projects/new'], '/projects/new')).toEqual(['/projects/new', '/usage']);
  });

  it(`caps the list at ${MAX_RECENT_COMMANDS}`, () => {
    const full = ['/a', '/b', '/c', '/d', '/e'];
    expect(pushRecentCommand(full, '/f')).toEqual(['/f', '/a', '/b', '/c', '/d']);
    expect(pushRecentCommand(full, '/f')).toHaveLength(MAX_RECENT_COMMANDS);
  });
});
