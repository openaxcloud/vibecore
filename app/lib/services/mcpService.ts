import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  experimental_createMCPClient,
  type ToolSet,
  type Message,
  type DataStreamWriter,
  convertToCoreMessages,
  formatDataStreamPart,
} from 'ai';
import { Experimental_StdioMCPTransport } from 'ai/mcp-stdio';
import { z } from 'zod';
import { clientStoresServicesText, type ClientStoresServicesKey } from '~/lib/i18n/catalogs/client-stores-services';
import { isBlockedMcpUrl } from '~/lib/services/mcp-url-guard';
import type { ToolCallAnnotation } from '~/types/context';
import {
  TOOL_EXECUTION_APPROVAL,
  TOOL_EXECUTION_DENIED,
  TOOL_EXECUTION_ERROR,
  TOOL_NO_EXECUTE_FUNCTION,
} from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('mcp-service');

/**
 * A server config that this deployment deliberately refuses to run (e.g. a
 * stdio server when stdio is disabled, or an SSE/HTTP URL pointing at a
 * blocked private/loopback/metadata address). These are EXPECTED rejections of
 * pre-existing stored config — not runtime failures — so the client init path
 * logs them quietly (debug) and marks the server unavailable instead of
 * emitting a full ERROR stack on every chat request (prod log noise that reads
 * as "the agent is throwing errors"). Genuine transport/tool failures still log
 * at error level.
 */
export class MCPConfigRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MCPConfigRejectedError';
  }
}

export const stdioServerConfigSchema = z
  .object({
    type: z.enum(['stdio']).optional(),
    command: z.string().min(1, clientStoresServicesText('clientServices.mcp.commandEmpty')),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
  })
  .transform((data) => ({
    ...data,
    type: 'stdio' as const,
  }));
export type STDIOServerConfig = z.infer<typeof stdioServerConfigSchema>;

export const sseServerConfigSchema = z
  .object({
    type: z.enum(['sse']).optional(),
    url: z.string().url(clientStoresServicesText('clientServices.mcp.urlInvalid')),
    headers: z.record(z.string()).optional(),
  })
  .transform((data) => ({
    ...data,
    type: 'sse' as const,
  }));
export type SSEServerConfig = z.infer<typeof sseServerConfigSchema>;

export const streamableHTTPServerConfigSchema = z
  .object({
    type: z.enum(['streamable-http']).optional(),
    url: z.string().url(clientStoresServicesText('clientServices.mcp.urlInvalid')),
    headers: z.record(z.string()).optional(),
  })
  .transform((data) => ({
    ...data,
    type: 'streamable-http' as const,
  }));

export type StreamableHTTPServerConfig = z.infer<typeof streamableHTTPServerConfigSchema>;

export const mcpServerConfigSchema = z.union([
  stdioServerConfigSchema,
  sseServerConfigSchema,
  streamableHTTPServerConfigSchema,
]);
export type MCPServerConfig = z.infer<typeof mcpServerConfigSchema>;

export const mcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerConfigSchema),
});
export type MCPConfig = z.infer<typeof mcpConfigSchema>;

/**
 * Restrict an MCPConfig to a per-request set of enabled server names.
 *
 * Lets the user turn individual MCP servers on/off for the NEXT message from the
 * composer's MCP panel without touching their saved configuration. Applied
 * BEFORE the clients are created, so disabled servers are never even connected
 * (no wasted stdio child / HTTP transport) and their tools never reach the LLM.
 *
 * Back-compat: `null`/`undefined` means "no per-request override" → all servers
 * kept (unchanged behaviour). An empty array means the user disabled everything
 * → no servers. Unknown names are simply ignored. Pure + exported for testing.
 */
export function filterEnabledMcpServers(config: MCPConfig, enabledNames: string[] | null | undefined): MCPConfig {
  if (!enabledNames) {
    return config;
  }

  const enabled = new Set(enabledNames);

  return {
    mcpServers: Object.fromEntries(Object.entries(config.mcpServers).filter(([name]) => enabled.has(name))),
  };
}

export type MCPClient = {
  tools: () => Promise<ToolSet>;
  close: () => Promise<void>;
} & {
  serverName: string;
};

export type ToolCall = {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
};

export type MCPServerTools = Record<string, MCPServer>;

export type MCPServerAvailable = {
  status: 'available';
  tools: ToolSet;
  client: MCPClient;
  config: MCPServerConfig;
};
export type MCPServerUnavailable = {
  status: 'unavailable';
  error: MCPUnavailableCode;
  client: MCPClient | null;
  config: MCPServerConfig;
};
export type MCPServer = MCPServerAvailable | MCPServerUnavailable;

export type MCPUnavailableCode = 'MCP_CONFIGURATION_REJECTED' | 'MCP_CONNECTION_FAILED' | 'MCP_TOOLS_UNAVAILABLE';

const MCP_UNAVAILABLE_CODE = {
  configurationRejected: 'MCP_CONFIGURATION_REJECTED',
  connectionFailed: 'MCP_CONNECTION_FAILED',
  toolsUnavailable: 'MCP_TOOLS_UNAVAILABLE',
} as const satisfies Readonly<Record<string, MCPUnavailableCode>>;

export class MCPService {
  private static _instance: MCPService;
  private readonly _language?: string | null;
  private _tools: ToolSet = {};
  private _toolsWithoutExecute: ToolSet = {};
  private _mcpToolsPerServer: MCPServerTools = {};
  private _toolNamesToServerNames = new Map<string, string>();
  private _config: MCPConfig = {
    mcpServers: {},
  };

  private _closed = false;

  constructor(language?: string | null) {
    this._language = language;
  }

  private _text(key: ClientStoresServicesKey, values: Readonly<Record<string, string | number | bigint>> = {}): string {
    return clientStoresServicesText(key, values, this._language);
  }

  /**
   * Process-wide shared instance. Do NOT use this for per-request work that
   * loads a specific user's MCP servers — the config, tools and credential-
   * bearing clients are instance state, so a shared instance leaks one tenant's
   * tools/credentials into another's concurrent request. Use `new MCPService()`
   * per request and `close()` it when the request ends.
   */
  static getInstance(): MCPService {
    if (!MCPService._instance) {
      MCPService._instance = new MCPService();
    }

    return MCPService._instance;
  }

  /**
   * Release all MCP clients (closing stdio child processes / HTTP transports)
   * and clear tool state. Idempotent — safe to call from multiple stream exit
   * paths (abort, onFinish, error).
   */
  async close(): Promise<void> {
    if (this._closed) {
      return;
    }

    this._closed = true;
    await this._closeClients();
  }

  private _validateServerConfig(serverName: string, config: any): MCPServerConfig {
    const hasStdioField = config.command !== undefined;
    const hasUrlField = config.url !== undefined;

    if (hasStdioField && hasUrlField) {
      throw new Error(this._text('clientServices.mcp.commandAndUrlConflict'));
    }

    if (!config.type && hasStdioField) {
      config.type = 'stdio';
    }

    if (hasUrlField && !config.type) {
      throw new Error(this._text('clientServices.mcp.typeRequired'));
    }

    if (!['stdio', 'sse', 'streamable-http'].includes(config.type)) {
      throw new Error(this._text('clientServices.mcp.typeInvalid'));
    }

    /*
     * Defense-in-depth against authenticated RCE on the shared multi-tenant host:
     * a stdio server's `command`/`args` is spawned as a CHILD PROCESS in this
     * Node/SSR process (_createStdioClient → child_process.spawn). The API
     * already rejects stdio at save time, but block it here too so any
     * already-stored config can't execute. Allow stdio only when explicitly
     * enabled for a trusted single-tenant/local deployment.
     */
    const allowStdio = (globalThis as any).process?.env?.MCP_ALLOW_STDIO_SERVERS === 'true';

    if (config.type === 'stdio' && !allowStdio) {
      throw new MCPConfigRejectedError(this._text('clientServices.mcp.stdioDisabled'));
    }

    // Check for type/field mismatch
    if (config.type === 'stdio' && !hasStdioField) {
      throw new Error(this._text('clientServices.mcp.commandRequired'));
    }

    if (['sse', 'streamable-http'].includes(config.type) && !hasUrlField) {
      throw new Error(this._text('clientServices.mcp.urlRequired'));
    }

    /*
     * SSRF guard: the web pod opens the SSE / streamable-http transport itself,
     * so reject loopback / link-local / private / cloud-metadata URLs here too -
     * not only at the API save path. Covers every web caller (the update-config
     * route + api.chat) as defense-in-depth, mirroring how stdio is centrally
     * blocked above.
     */
    if (
      ['sse', 'streamable-http'].includes(config.type) &&
      typeof config.url === 'string' &&
      isBlockedMcpUrl(config.url)
    ) {
      throw new MCPConfigRejectedError(this._text('clientServices.mcp.urlBlocked'));
    }

    try {
      return mcpServerConfigSchema.parse(config);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const publicError = new Error(this._text('clientServices.mcp.configurationInvalid', { server: serverName }), {
          cause: validationError,
        });
        throw publicError;
      }

      throw validationError;
    }
  }

  async updateConfig(config: MCPConfig) {
    logger.debug('updating config', JSON.stringify(config));
    this._config = config;
    await this._createClients();

    return this._mcpToolsPerServer;
  }

  private async _createStreamableHTTPClient(
    serverName: string,
    config: StreamableHTTPServerConfig,
  ): Promise<MCPClient> {
    logger.debug(`Creating Streamable-HTTP client for ${serverName} with URL: ${config.url}`);

    const client = await experimental_createMCPClient({
      transport: new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: {
          headers: config.headers,
        },
      }),
    });

    return Object.assign(client, { serverName });
  }

  private async _createSSEClient(serverName: string, config: SSEServerConfig): Promise<MCPClient> {
    logger.debug(`Creating SSE client for ${serverName} with URL: ${config.url}`);

    const client = await experimental_createMCPClient({
      transport: config,
    });

    return Object.assign(client, { serverName });
  }

  private async _createStdioClient(serverName: string, config: STDIOServerConfig): Promise<MCPClient> {
    logger.debug(
      `Creating STDIO client for '${serverName}' with command: '${config.command}' ${config.args?.join(' ') || ''}`,
    );

    const client = await experimental_createMCPClient({ transport: new Experimental_StdioMCPTransport(config) });

    return Object.assign(client, { serverName });
  }

  private _registerTools(serverName: string, tools: ToolSet) {
    for (const [toolName, tool] of Object.entries(tools)) {
      if (this._tools[toolName]) {
        const existingServerName = this._toolNamesToServerNames.get(toolName);

        if (existingServerName && existingServerName !== serverName) {
          logger.warn(`Tool conflict: "${toolName}" from "${serverName}" overrides tool from "${existingServerName}"`);
        }
      }

      this._tools[toolName] = tool;
      this._toolsWithoutExecute[toolName] = { ...tool, execute: undefined };
      this._toolNamesToServerNames.set(toolName, serverName);
    }
  }

  private async _createMCPClient(serverName: string, serverConfig: MCPServerConfig): Promise<MCPClient> {
    const validatedConfig = this._validateServerConfig(serverName, serverConfig);

    if (validatedConfig.type === 'stdio') {
      return await this._createStdioClient(serverName, serverConfig as STDIOServerConfig);
    } else if (validatedConfig.type === 'sse') {
      return await this._createSSEClient(serverName, serverConfig as SSEServerConfig);
    } else {
      return await this._createStreamableHTTPClient(serverName, serverConfig as StreamableHTTPServerConfig);
    }
  }

  private async _createClients() {
    await this._closeClients();

    const createClientPromises = Object.entries(this._config?.mcpServers || []).map(async ([serverName, config]) => {
      let client: MCPClient | null = null;

      try {
        client = await this._createMCPClient(serverName, config);

        try {
          const tools = await client.tools();

          this._registerTools(serverName, tools);

          this._mcpToolsPerServer[serverName] = {
            status: 'available',
            client,
            tools,
            config,
          };
        } catch (error) {
          logger.error(`Failed to get tools from server ${serverName}:`, error);
          this._mcpToolsPerServer[serverName] = {
            status: 'unavailable',
            error: MCP_UNAVAILABLE_CODE.toolsUnavailable,
            client,
            config,
          };
        }
      } catch (error) {
        if (error instanceof MCPConfigRejectedError) {
          /*
           * Expected policy rejection of stored config (stdio disabled / blocked
           * URL): mark unavailable and log once at debug so a user who still has a
           * default stdio "memory" server saved doesn't spam an ERROR stack on
           * every chat request.
           */
          logger.debug(`Skipping MCP server "${serverName}": ${error.message}`);
        } else {
          logger.error(`Failed to initialize MCP client for server: ${serverName}`, error);
        }

        this._mcpToolsPerServer[serverName] = {
          status: 'unavailable',
          error:
            error instanceof MCPConfigRejectedError
              ? MCP_UNAVAILABLE_CODE.configurationRejected
              : MCP_UNAVAILABLE_CODE.connectionFailed,
          client,
          config,
        };
      }
    });

    await Promise.allSettled(createClientPromises);
  }

  async checkServersAvailabilities() {
    this._tools = {};
    this._toolsWithoutExecute = {};
    this._toolNamesToServerNames.clear();

    const checkPromises = Object.entries(this._mcpToolsPerServer).map(async ([serverName, server]) => {
      let client = server.client;

      try {
        logger.debug(`Checking MCP server "${serverName}" availability: start`);

        if (!client) {
          client = await this._createMCPClient(serverName, this._config?.mcpServers[serverName]);
        }

        try {
          const tools = await client.tools();

          this._registerTools(serverName, tools);

          this._mcpToolsPerServer[serverName] = {
            status: 'available',
            client,
            tools,
            config: server.config,
          };
        } catch (error) {
          logger.error(`Failed to get tools from server ${serverName}:`, error);
          this._mcpToolsPerServer[serverName] = {
            status: 'unavailable',
            error: MCP_UNAVAILABLE_CODE.toolsUnavailable,
            client,
            config: server.config,
          };
        }

        logger.debug(`Checking MCP server "${serverName}" availability: end`);
      } catch (error) {
        logger.error(`Failed to connect to server ${serverName}:`, error);
        this._mcpToolsPerServer[serverName] = {
          status: 'unavailable',
          error: MCP_UNAVAILABLE_CODE.connectionFailed,
          client,
          config: server.config,
        };
      }
    });

    await Promise.allSettled(checkPromises);

    return this._mcpToolsPerServer;
  }

  private async _closeClients(): Promise<void> {
    const closePromises = Object.entries(this._mcpToolsPerServer).map(async ([serverName, server]) => {
      if (!server.client) {
        return;
      }

      logger.debug(`Closing client for server "${serverName}"`);

      try {
        await server.client.close();
      } catch (error) {
        logger.error(`Error closing client for ${serverName}:`, error);
      }
    });

    await Promise.allSettled(closePromises);
    this._tools = {};
    this._toolsWithoutExecute = {};
    this._mcpToolsPerServer = {};
    this._toolNamesToServerNames.clear();
  }

  isValidToolName(toolName: string): boolean {
    return toolName in this._tools;
  }

  processToolCall(toolCall: ToolCall, dataStream: DataStreamWriter): void {
    const { toolCallId, toolName } = toolCall;

    if (this.isValidToolName(toolName)) {
      const { description = this._text('clientServices.mcp.toolDescriptionUnavailable') } =
        this.toolsWithoutExecute[toolName];

      const serverName = this._toolNamesToServerNames.get(toolName);

      if (serverName) {
        dataStream.writeMessageAnnotation({
          type: 'toolCall',
          toolCallId,
          serverName,
          toolName,
          toolDescription: description,
        } satisfies ToolCallAnnotation);
      }
    }
  }

  async processToolInvocations(messages: Message[], dataStream: DataStreamWriter): Promise<Message[]> {
    const lastMessage = messages[messages.length - 1];
    const parts = lastMessage.parts;

    if (!parts) {
      return messages;
    }

    const processedParts = await Promise.all(
      parts.map(async (part) => {
        // Only process tool invocations parts
        if (part.type !== 'tool-invocation') {
          return part;
        }

        const { toolInvocation } = part;
        const { toolName, toolCallId } = toolInvocation;

        // return part as-is if tool does not exist, or if it's not a tool call result
        if (!this.isValidToolName(toolName) || toolInvocation.state !== 'result') {
          return part;
        }

        let result;

        if (toolInvocation.result === TOOL_EXECUTION_APPROVAL.APPROVE) {
          const toolInstance = this._tools[toolName];

          if (toolInstance && typeof toolInstance.execute === 'function') {
            logger.debug(`calling tool "${toolName}" with args: ${JSON.stringify(toolInvocation.args)}`);

            try {
              result = await toolInstance.execute(toolInvocation.args, {
                messages: convertToCoreMessages(messages),
                toolCallId,
              });
            } catch (error) {
              logger.error(`error while calling tool "${toolName}":`, error);
              result = TOOL_EXECUTION_ERROR;
            }
          } else {
            result = TOOL_NO_EXECUTE_FUNCTION;
          }
        } else if (toolInvocation.result === TOOL_EXECUTION_APPROVAL.REJECT) {
          result = TOOL_EXECUTION_DENIED;
        } else {
          // For any unhandled responses, return the original part.
          return part;
        }

        // Forward updated tool result to the client.
        dataStream.write(
          formatDataStreamPart('tool_result', {
            toolCallId,
            result,
          }),
        );

        // Return updated toolInvocation with the actual result.
        return {
          ...part,
          toolInvocation: {
            ...toolInvocation,
            result,
          },
        };
      }),
    );

    // Finally return the processed messages
    return [...messages.slice(0, -1), { ...lastMessage, parts: processedParts }];
  }

  get tools() {
    return this._tools;
  }

  /** Number of servers in the currently-loaded config (used to decide whether a refresh is needed). */
  get configuredServerCount() {
    return Object.keys(this._config?.mcpServers ?? {}).length;
  }

  get toolsWithoutExecute() {
    return this._toolsWithoutExecute;
  }
}
