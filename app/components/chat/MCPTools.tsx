import { useEffect, useMemo, useState } from 'react';
import McpServerList from '~/components/@settings/tabs/mcp/McpServerList';
import { Dialog, DialogRoot, DialogClose, DialogTitle, DialogButton } from '~/components/ui/Dialog';
import { IconButton } from '~/components/ui/IconButton';
import { useMCPStore } from '~/lib/stores/mcp';
import { classNames } from '~/utils/classNames';

interface McpToolsProps {
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: 'icon' | 'menu';
}

export function McpTools({ triggerClassName, triggerLabel = 'MCP tools', triggerVariant = 'icon' }: McpToolsProps) {
  const isInitialized = useMCPStore((state) => state.isInitialized);
  const serverTools = useMCPStore((state) => state.serverTools);
  const initialize = useMCPStore((state) => state.initialize);
  const checkServersAvailabilities = useMCPStore((state) => state.checkServersAvailabilities);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingServers, setIsCheckingServers] = useState(false);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  useEffect(() => {
    if (!isInitialized) {
      initialize().catch((e) => {
        setError(`Failed to initialize MCP: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
  }, [isInitialized]);

  const checkServerAvailability = async () => {
    setIsCheckingServers(true);
    setError(null);

    try {
      await checkServersAvailabilities();
    } catch (e) {
      setError(`Failed to check server availability: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingServers(false);
    }
  };

  const toggleServerExpanded = (serverName: string) => {
    setExpandedServer(expandedServer === serverName ? null : serverName);
  };

  const handleDialogOpen = (open: boolean) => {
    setIsDialogOpen(open);
  };

  const serverEntries = useMemo(() => Object.entries(serverTools), [serverTools]);
  const isMenuTrigger = triggerVariant === 'menu';

  const allServerNames = useMemo(() => serverEntries.map(([name]) => name), [serverEntries]);

  /*
   * Per-request MCP server allow-list (null = all enabled). Lets the user disable
   * specific servers for the NEXT message without editing their saved config.
   * Synced to Chat.client via localStorage + a custom event (mirrors agentPower).
   */
  const [mcpEnabled, setMcpEnabled] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem('vibecore.mcpEnabledServers');
      const parsed = raw ? JSON.parse(raw) : null;
      setMcpEnabled(Array.isArray(parsed) ? parsed.filter((name: unknown) => typeof name === 'string') : null);
    } catch {
      // ignore malformed/blocked storage
    }
  }, [isDialogOpen]);

  const isServerEnabled = (name: string) => mcpEnabled === null || mcpEnabled.includes(name);

  const toggleServerEnabled = (name: string) => {
    const current = mcpEnabled === null ? [...allServerNames] : [...mcpEnabled];
    const next = current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name];

    // When every configured server is enabled, store null ("all") for a clean payload.
    const payload = allServerNames.length > 0 && allServerNames.every((entry) => next.includes(entry)) ? null : next;

    setMcpEnabled(payload);

    try {
      if (payload === null) {
        window.localStorage.removeItem('vibecore.mcpEnabledServers');
      } else {
        window.localStorage.setItem('vibecore.mcpEnabledServers', JSON.stringify(payload));
      }

      window.dispatchEvent(new CustomEvent('vibecore:mcp-enabled-servers-change', { detail: payload }));
    } catch {
      // ignore blocked storage
    }
  };

  return (
    <div className="relative">
      <div className="flex">
        <IconButton
          onClick={() => setIsDialogOpen(true)}
          title={error ? 'MCP failed to initialize — click for details' : 'MCP Tools Available'}
          tooltip="MCP tools"
          disabled={!isInitialized && !error}
          className={classNames(
            isMenuTrigger ? 'bolt-chatbox-tools-menu-item' : 'transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            triggerClassName,
          )}
        >
          <>
            {!isInitialized ? (
              <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin"></div>
            ) : (
              <div className="i-bolt:mcp text-xl"></div>
            )}
            {isMenuTrigger ? <span>{triggerLabel}</span> : null}
          </>
        </IconButton>
      </div>

      <DialogRoot open={isDialogOpen} onOpenChange={handleDialogOpen}>
        {isDialogOpen && (
          <Dialog className="w-[860px] max-w-[calc(100vw-24px)] max-h-[calc(100vh-24px)] overflow-hidden">
            <div className="w-full max-h-[calc(100vh-24px)] min-h-0 flex flex-col overflow-hidden">
              <header className="flex items-start justify-between gap-4 border-b border-bolt-elements-borderColor px-5 py-4 pr-12">
                <div className="min-w-0">
                  <DialogTitle>
                    <div className="i-bolt:mcp text-xl"></div>
                    MCP tools
                  </DialogTitle>
                  <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                    View and refresh the MCP tools available to the agent.
                  </p>
                </div>

                <button
                  onClick={checkServerAvailability}
                  disabled={isCheckingServers || serverEntries.length === 0}
                  className={classNames(
                    'shrink-0 px-3 py-1.5 rounded-lg text-sm',
                    'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
                    'text-bolt-elements-textPrimary',
                    'transition-all duration-200',
                    'flex items-center gap-2',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  {isCheckingServers ? (
                    <div className="i-svg-spinners:90-ring-with-bg w-3 h-3 text-bolt-elements-loader-progress animate-spin" />
                  ) : (
                    <div className="i-ph:arrow-counter-clockwise w-3 h-3" />
                  )}
                  Check availability
                </button>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 custom-scrollbar">
                {serverEntries.length > 0 ? (
                  <div className="mb-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
                    <p className="mb-2 text-xs font-medium text-bolt-elements-textPrimary">
                      Active for the next message
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allServerNames.map((name) => {
                        const enabled = isServerEnabled(name);

                        return (
                          <label
                            key={name}
                            className={classNames(
                              'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
                              enabled
                                ? 'border-bolt-elements-borderColor text-bolt-elements-textPrimary'
                                : 'border-dashed border-bolt-elements-borderColor text-bolt-elements-textTertiary line-through',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => toggleServerEnabled(name)}
                              className="accent-bolt-elements-item-contentAccent"
                            />
                            {name}
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] text-bolt-elements-textSecondary">
                      Unchecked servers are skipped for the next message only — your saved configuration is unchanged.
                    </p>
                  </div>
                ) : null}
                {serverEntries.length > 0 ? (
                  <McpServerList
                    checkingServers={isCheckingServers}
                    expandedServer={expandedServer}
                    serverEntries={serverEntries}
                    onlyShowAvailableServers={true}
                    toggleServerExpanded={toggleServerExpanded}
                  />
                ) : (
                  <div className="rounded-lg border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 py-8 text-center text-bolt-elements-textSecondary">
                    <p>No MCP servers configured</p>
                    <p className="text-xs mt-1">Configure servers in Settings → MCP Servers</p>
                  </div>
                )}

                {error && <p className="mt-4 text-sm text-bolt-elements-icon-error">{error}</p>}
              </div>

              <footer className="flex justify-end gap-2 border-t border-bolt-elements-borderColor px-5 py-3">
                <DialogClose asChild>
                  <DialogButton type="secondary">Close</DialogButton>
                </DialogClose>
              </footer>
            </div>
          </Dialog>
        )}
      </DialogRoot>
    </div>
  );
}
