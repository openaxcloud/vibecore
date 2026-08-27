import { useStore } from '@nanostores/react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { refreshSupabaseProjects } from './SupabaseConnection.helpers';
import { Dialog, DialogRoot, DialogClose, DialogTitle, DialogButton } from '~/components/ui/Dialog';
import { useSupabaseConnection } from '~/lib/hooks/useSupabaseConnection';
import {
  formatSupabaseConnectionCopy,
  formatSupabaseConnectionNumber,
  getSupabaseConnectionCopy,
  getSupabaseConnectionSafeError,
} from '~/lib/i18n/catalogs/supabase-connection';
import { chatId } from '~/lib/persistence/useChatHistory';
import { fetchSupabaseStats } from '~/lib/stores/supabase';
import { classNames } from '~/utils/classNames';

interface SupabaseConnectionProps {
  /*
   * 'bar' renders the standalone bordered toolbar button (default). 'menu'
   * renders a full-width row that fits inside the "More composer & tools" menu.
   */
  triggerVariant?: 'bar' | 'menu';

  /** Fired when the user opens the connection dialog (e.g. to close the parent menu). */
  onOpen?: () => void;
}

export function SupabaseConnection({ triggerVariant = 'bar', onOpen }: SupabaseConnectionProps = {}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getSupabaseConnectionCopy(language);

  const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
    formatSupabaseConnectionCopy(template, values);

  const {
    connection: supabaseConn,
    connecting,
    fetchingStats,
    isProjectsExpanded,
    setIsProjectsExpanded,
    isDropdownOpen: isDialogOpen,
    setIsDropdownOpen: setIsDialogOpen,
    handleConnect,
    handleDisconnect,
    selectProject,
    handleCreateProject,
    updateToken,
    isConnected,
    fetchProjectApiKeys,
  } = useSupabaseConnection();

  const currentChatId = useStore(chatId);

  useEffect(() => {
    const handleOpenConnectionDialog = () => {
      setIsDialogOpen(true);
    };

    document.addEventListener('open-supabase-connection', handleOpenConnectionDialog);

    return () => {
      document.removeEventListener('open-supabase-connection', handleOpenConnectionDialog);
    };
  }, [setIsDialogOpen]);

  useEffect(() => {
    if (isConnected && currentChatId) {
      const savedProjectId = localStorage.getItem(`supabase-project-${currentChatId}`);

      /*
       * If there's no saved project for this chat but there is a global selected project,
       * use the global one instead of clearing it
       */
      if (!savedProjectId && supabaseConn.selectedProjectId) {
        // Save the current global project to this chat
        localStorage.setItem(`supabase-project-${currentChatId}`, supabaseConn.selectedProjectId);
      } else if (savedProjectId && savedProjectId !== supabaseConn.selectedProjectId) {
        selectProject(savedProjectId);
      }
    }
  }, [isConnected, currentChatId]);

  useEffect(() => {
    if (currentChatId && supabaseConn.selectedProjectId) {
      localStorage.setItem(`supabase-project-${currentChatId}`, supabaseConn.selectedProjectId);
    } else if (currentChatId && !supabaseConn.selectedProjectId) {
      localStorage.removeItem(`supabase-project-${currentChatId}`);
    }
  }, [currentChatId, supabaseConn.selectedProjectId]);

  useEffect(() => {
    if (isConnected && supabaseConn.token) {
      fetchSupabaseStats(supabaseConn.token).catch(console.error);
    }
  }, [isConnected, supabaseConn.token]);

  useEffect(() => {
    if (isConnected && supabaseConn.selectedProjectId && supabaseConn.token && !supabaseConn.credentials) {
      fetchProjectApiKeys(supabaseConn.selectedProjectId).catch(console.error);
    }
  }, [isConnected, supabaseConn.selectedProjectId, supabaseConn.token, supabaseConn.credentials]);

  const openDialog = () => {
    onOpen?.();
    setIsDialogOpen(!isDialogOpen);
  };

  const supabaseIcon = (
    <img
      className="w-4 h-4"
      height="20"
      width="20"
      crossOrigin="anonymous"
      alt=""
      aria-hidden
      src="https://cdn.simpleicons.org/supabase"
    />
  );

  return (
    <div className="relative min-w-0">
      {triggerVariant === 'menu' ? (
        <button
          type="button"
          disabled={connecting}
          onClick={openDialog}
          className="bolt-chatbox-tools-menu-item"
          aria-label={copy['supabaseConnection.trigger.openAria']}
        >
          {supabaseIcon}
          <span className="min-w-0 break-words">
            {isConnected && supabaseConn.project
              ? text(copy['supabaseConnection.trigger.connected'], { projectName: supabaseConn.project.name })
              : copy['supabaseConnection.trigger.open']}
          </span>
        </button>
      ) : (
        <div className="flex border border-bolt-elements-borderColor rounded-md overflow-hidden mr-2 text-sm">
          <Button
            active
            disabled={connecting}
            onClick={openDialog}
            className="min-h-11 min-w-11 hover:bg-bolt-elements-item-backgroundActive !text-white flex items-center gap-2"
            ariaLabel={copy['supabaseConnection.trigger.openAria']}
            tooltip={copy['supabaseConnection.trigger.tooltip']}
          >
            {supabaseIcon}
            <span className="sr-only">{copy['supabaseConnection.trigger.openAria']}</span>
            {isConnected && supabaseConn.project && (
              <span className="ml-1 text-xs max-w-[100px] truncate">{supabaseConn.project.name}</span>
            )}
          </Button>
        </div>
      )}

      <DialogRoot open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {isDialogOpen && (
          <Dialog className="w-full max-w-[520px] overflow-x-hidden p-4 break-words sm:p-6">
            {!isConnected ? (
              <div className="space-y-4">
                <DialogTitle>
                  <img
                    className="w-5 h-5"
                    height="24"
                    width="24"
                    crossOrigin="anonymous"
                    alt=""
                    aria-hidden
                    src="https://cdn.simpleicons.org/supabase"
                  />
                  {copy['supabaseConnection.dialog.connectTitle']}
                </DialogTitle>

                <div>
                  <label
                    htmlFor="supabase-access-token"
                    className="block text-sm text-bolt-elements-textSecondary mb-2"
                  >
                    {copy['supabaseConnection.token.label']}
                  </label>
                  <input
                    id="supabase-access-token"
                    aria-label={copy['supabaseConnection.token.aria']}
                    type="password"
                    value={supabaseConn.token}
                    onChange={(e) => updateToken(e.target.value)}
                    disabled={connecting}
                    placeholder={copy['supabaseConnection.token.placeholder']}
                    className={classNames(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-bolt-elements-background-depth-2',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                      'focus:outline-none focus:ring-1 focus:ring-[#3ECF8E]',
                      'disabled:opacity-50',
                    )}
                  />
                  <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                    <a
                      href="https://app.supabase.com/account/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-1 break-words text-[#3ECF8E] hover:underline"
                    >
                      {copy['supabaseConnection.token.get']}
                      <div className="i-ph:arrow-square-out h-4 w-4 shrink-0" aria-hidden />
                    </a>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <DialogClose asChild>
                    <DialogButton type="secondary">{copy['supabaseConnection.action.cancel']}</DialogButton>
                  </DialogClose>
                  <button
                    type="button"
                    onClick={handleConnect}
                    disabled={connecting || !supabaseConn.token}
                    className={classNames(
                      'min-h-11 min-w-0 px-4 py-2 rounded-lg text-sm flex items-center justify-center gap-2 whitespace-normal text-center',
                      'bg-[#3ECF8E] text-white',
                      'hover:bg-[#3BBF84]',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {connecting ? (
                      <>
                        <div className="i-ph:spinner-gap animate-spin" aria-hidden />
                        {copy['supabaseConnection.action.connecting']}
                      </>
                    ) : (
                      <>
                        <div className="i-ph:plug-charging h-4 w-4 shrink-0" aria-hidden />
                        {copy['supabaseConnection.action.connect']}
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <DialogTitle>
                    <img
                      className="w-5 h-5"
                      height="24"
                      width="24"
                      crossOrigin="anonymous"
                      alt=""
                      aria-hidden
                      src="https://cdn.simpleicons.org/supabase"
                    />
                    {copy['supabaseConnection.dialog.connectedTitle']}
                  </DialogTitle>
                </div>

                <div className="flex min-w-0 items-center gap-4 rounded-lg bg-bolt-elements-background-depth-2 p-3">
                  <div className="min-w-0">
                    <h4 className="break-all text-sm font-medium text-bolt-elements-textPrimary">
                      {supabaseConn.user?.email}
                    </h4>
                    <p className="break-words text-xs text-bolt-elements-textSecondary">
                      {text(copy['supabaseConnection.account.role'], { role: supabaseConn.user?.role ?? '' })}
                    </p>
                  </div>
                </div>

                {fetchingStats ? (
                  <div
                    className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="i-ph:spinner-gap h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    {copy['supabaseConnection.projects.loading']}
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <button
                        type="button"
                        onClick={() => setIsProjectsExpanded(!isProjectsExpanded)}
                        className="flex min-h-11 min-w-0 flex-1 items-center gap-2 bg-transparent text-left text-sm font-medium leading-snug text-bolt-elements-textPrimary"
                        aria-expanded={isProjectsExpanded}
                        aria-controls="supabase-projects-list"
                        aria-label={
                          isProjectsExpanded
                            ? copy['supabaseConnection.projects.collapse']
                            : copy['supabaseConnection.projects.expand']
                        }
                      >
                        <div className="i-ph:database h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words">
                          {text(copy['supabaseConnection.projects.heading'], {
                            count: formatSupabaseConnectionNumber(supabaseConn.stats?.totalProjects || 0, language),
                          })}
                        </span>
                        <div
                          className={classNames(
                            'i-ph:caret-down h-4 w-4 shrink-0 transition-transform',
                            isProjectsExpanded ? 'rotate-180' : '',
                          )}
                          aria-hidden
                        />
                      </button>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            refreshSupabaseProjects(fetchSupabaseStats, supabaseConn.token, {
                              onError: (error) => toast.error(getSupabaseConnectionSafeError(language, error)),
                            })
                          }
                          className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md bg-bolt-elements-background-depth-2 px-3 py-2 text-center text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
                          title={copy['supabaseConnection.projects.refreshTitle']}
                        >
                          <div className="i-ph:arrows-clockwise h-3 w-3 shrink-0" aria-hidden />
                          <span className="break-words">{copy['supabaseConnection.action.refresh']}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCreateProject()}
                          className="flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-md bg-[#3ECF8E] px-3 py-2 text-center text-xs text-white hover:bg-[#3BBF84]"
                        >
                          <div className="i-ph:plus h-3 w-3 shrink-0" aria-hidden />
                          <span className="break-words">{copy['supabaseConnection.action.newProject']}</span>
                        </button>
                      </div>
                    </div>

                    {isProjectsExpanded && (
                      <div id="supabase-projects-list">
                        {!supabaseConn.selectedProjectId && (
                          <div className="mb-2 break-words rounded-lg bg-bolt-elements-background-depth-2 p-3 text-sm text-bolt-elements-textSecondary">
                            {copy['supabaseConnection.projects.selectPrompt']}
                          </div>
                        )}

                        {supabaseConn.stats?.projects?.length ? (
                          <div className="grid max-h-60 gap-2 overflow-y-auto">
                            {supabaseConn.stats.projects.map((project) => (
                              <div
                                key={project.id}
                                className="block p-3 rounded-lg border border-bolt-elements-borderColor hover:border-[#3ECF8E] dark:hover:border-[#3ECF8E] transition-colors"
                              >
                                <div className="flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div className="min-w-0">
                                    <h5 className="flex min-w-0 items-center gap-1 break-all text-sm font-medium text-bolt-elements-textPrimary">
                                      <div className="i-ph:database h-3 w-3 shrink-0 text-[#3ECF8E]" aria-hidden />
                                      <span className="min-w-0">{project.name}</span>
                                    </h5>
                                    <div className="mt-1 break-all text-xs text-bolt-elements-textSecondary">
                                      {project.region}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => selectProject(project.id)}
                                    className={classNames(
                                      'min-h-11 min-w-0 rounded-md px-3 py-2 text-xs whitespace-normal sm:w-auto',
                                      supabaseConn.selectedProjectId === project.id
                                        ? 'bg-[#3ECF8E] text-white'
                                        : 'bg-bolt-elements-background-depth-2 text-bolt-elements-textSecondary hover:bg-[#3ECF8E] hover:text-white',
                                    )}
                                    aria-pressed={supabaseConn.selectedProjectId === project.id}
                                    aria-label={text(
                                      copy[
                                        supabaseConn.selectedProjectId === project.id
                                          ? 'supabaseConnection.project.selectedAria'
                                          : 'supabaseConnection.project.selectAria'
                                      ],
                                      { projectName: project.name },
                                    )}
                                  >
                                    {supabaseConn.selectedProjectId === project.id ? (
                                      <span className="flex items-center justify-center gap-1 break-words">
                                        <div className="i-ph:check h-3 w-3 shrink-0" aria-hidden />
                                        {copy['supabaseConnection.action.selected']}
                                      </span>
                                    ) : (
                                      copy['supabaseConnection.action.select']
                                    )}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-2 text-sm text-bolt-elements-textSecondary"
                            role="status"
                          >
                            <div className="i-ph:info h-4 w-4 shrink-0" aria-hidden />
                            {copy['supabaseConnection.projects.empty']}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <DialogClose asChild>
                    <DialogButton type="secondary">{copy['supabaseConnection.action.close']}</DialogButton>
                  </DialogClose>
                  <DialogButton type="danger" onClick={handleDisconnect}>
                    <div className="i-ph:plugs h-4 w-4 shrink-0" aria-hidden />
                    {copy['supabaseConnection.action.disconnect']}
                  </DialogButton>
                </div>
              </div>
            )}
          </Dialog>
        )}
      </DialogRoot>
    </div>
  );
}

interface ButtonProps {
  active?: boolean;
  disabled?: boolean;
  children?: any;
  onClick?: VoidFunction;
  className?: string;
  ariaLabel?: string;
  tooltip?: string;
}

function Button({ active = false, disabled = false, children, onClick, className, ariaLabel, tooltip }: ButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      data-vc-tooltip={tooltip}
      className={classNames(
        'flex items-center p-1.5',
        {
          'bg-bolt-elements-item-backgroundDefault hover:bg-bolt-elements-item-backgroundActive text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary':
            !active,
          'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentAccent': active && !disabled,
          'bg-bolt-elements-item-backgroundDefault text-bolt-elements-textTertiary cursor-not-allowed': disabled,
        },
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
