import { describe, expect, it } from 'vitest';
import { filterEnabledMcpServers, MCPService, type MCPConfig } from './mcpService';

const config: MCPConfig = {
  mcpServers: {
    github: { type: 'sse', url: 'https://mcp.example.com/github' },
    linear: { type: 'sse', url: 'https://mcp.example.com/linear' },
    memory: { type: 'sse', url: 'https://mcp.example.com/memory' },
  } as MCPConfig['mcpServers'],
};

describe('filterEnabledMcpServers', () => {
  it('keeps all servers when no override is given (null/undefined)', () => {
    expect(Object.keys(filterEnabledMcpServers(config, null).mcpServers)).toEqual(['github', 'linear', 'memory']);
    expect(Object.keys(filterEnabledMcpServers(config, undefined).mcpServers)).toEqual(['github', 'linear', 'memory']);
  });

  it('keeps only the enabled servers', () => {
    expect(Object.keys(filterEnabledMcpServers(config, ['github', 'linear']).mcpServers)).toEqual(['github', 'linear']);
  });

  it('drops everything when the enabled list is empty', () => {
    expect(Object.keys(filterEnabledMcpServers(config, []).mcpServers)).toEqual([]);
  });

  it('ignores unknown server names', () => {
    expect(Object.keys(filterEnabledMcpServers(config, ['github', 'does-not-exist']).mcpServers)).toEqual(['github']);
  });

  it('does not mutate the input config', () => {
    filterEnabledMcpServers(config, ['github']);

    expect(Object.keys(config.mcpServers)).toEqual(['github', 'linear', 'memory']);
  });

  it('exposes a stable code instead of a raw policy diagnostic', async () => {
    const service = new MCPService();

    const result = await service.updateConfig({
      mcpServers: {
        privateServer: { type: 'sse', url: 'https://127.0.0.1/tools' },
      },
    });

    expect(result.privateServer).toMatchObject({
      status: 'unavailable',
      error: 'MCP_CONFIGURATION_REJECTED',
    });
    expect(result.privateServer?.error).not.toContain('127.0.0.1');

    await service.close();
  });
});
