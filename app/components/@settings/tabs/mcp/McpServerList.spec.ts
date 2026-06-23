import { describe, expect, it } from 'vitest';
import { getNoAvailableServersMessage } from '~/components/@settings/tabs/mcp/McpServerList';

describe('getNoAvailableServersMessage', () => {
  it('uses singular phrasing for a single configured server', () => {
    expect(getNoAvailableServersMessage(1)).toBe(
      'No available MCP servers — 1 configured server is currently unavailable',
    );
  });

  it('uses plural phrasing for multiple configured servers', () => {
    expect(getNoAvailableServersMessage(3)).toBe(
      'No available MCP servers — 3 configured servers are currently unavailable',
    );
  });
});
