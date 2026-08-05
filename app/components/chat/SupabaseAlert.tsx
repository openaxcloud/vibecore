import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
import { supabaseConnection } from '~/lib/stores/supabase';
import type { SupabaseAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: SupabaseAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

/**
 * Strip comments and reformat SQL for display. The exact same text returned
 * here is what gets executed against the database, so the SQL the user reviews
 * in the expandable preview is byte-for-byte what runs (see executeSupabaseAction
 * call site below).
 */
export function cleanSqlContent(content: string) {
  if (!content) {
    return '';
  }

  let cleaned = content.replace(/\/\*[\s\S]*?\*\//g, '');

  /*
   * Strip only real PostgreSQL comments. PostgreSQL uses `--` for single-line
   * comments and `/* *​/` for block comments. It does NOT use `#` as a comment
   * marker (that's MySQL) — in Postgres `#` is an operator: JSONB path operators
   * (`#>`, `#>>`, `#-`) and bitwise XOR (`#`). Stripping after `#` silently
   * truncates valid SQL and runs a different, broken query against the live DB.
   */
  cleaned = cleaned.replace(/(--).*$/gm, '');

  const statements = cleaned
    .split(';')
    .map((stmt) => stmt.trim())
    .filter((stmt) => stmt.length > 0)
    .join(';\n\n');

  return statements;
}

export function SupabaseChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);
  const { content } = alert;
  const connection = useStore(supabaseConnection);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [executionError, setExecutionError] = useState<string | null>(null);

  // Determine connection state
  const isConnected = !!(connection.token && connection.selectedProjectId);

  // Set title and description based on connection state
  const title = isConnected
    ? copy['chatResiduals.supabase.queryTitle']
    : copy['chatResiduals.supabase.connectionTitle'];
  const description = isConnected
    ? copy['chatResiduals.supabase.queryDescription']
    : copy['chatResiduals.supabase.connectionDescription'];

  const message = isConnected
    ? copy['chatResiduals.supabase.reviewMessage']
    : copy['chatResiduals.supabase.connectMessage'];

  const handleConnectClick = () => {
    // Dispatch an event to open the Supabase connection dialog
    document.dispatchEvent(new CustomEvent('open-supabase-connection'));
  };

  // Determine if we should show the Connect button or Apply Changes button
  const showConnectButton = !isConnected;

  const executeSupabaseAction = async (sql: string) => {
    if (!connection.token || !connection.selectedProjectId) {
      console.error('No Supabase token or project selected');
      setExecutionError(copy['chatResiduals.supabase.executionFailed']);

      return;
    }

    setIsExecuting(true);
    setExecutionError(null);

    try {
      const response = await fetch('/api/supabase/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${connection.token}`,
        },
        body: JSON.stringify({
          projectId: connection.selectedProjectId,
          query: sql,
        }),
      });

      if (!response.ok) {
        throw new Error(String(response.status));
      }

      await response.json().catch(() => undefined);
      clearAlert();
    } catch (error) {
      console.error('Failed to execute Supabase action:', error);
      setExecutionError(copy['chatResiduals.supabase.executionFailed']);
      postMessage(copy['chatResiduals.supabase.agentRetryMessage']);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-chat rounded-lg border border-l-2 border-bolt-elements-borderColor border-l-[#098F5F] bg-bolt-elements-background-depth-2"
      >
        {/* Header */}
        <div className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <img
              height="10"
              width="18"
              alt=""
              aria-hidden="true"
              crossOrigin="anonymous"
              src="https://cdn.simpleicons.org/supabase"
            />
            <h3 className="text-sm font-medium text-[#3DCB8F]">{title}</h3>
          </div>
        </div>

        {/* SQL Content */}
        <div className="px-4">
          {!isConnected ? (
            <div className="rounded-md bg-bolt-elements-background-depth-3 p-3">
              <span className="break-words text-sm text-bolt-elements-textPrimary">
                {copy['chatResiduals.supabase.connectFirst']}
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={
                  isCollapsed ? copy['chatResiduals.supabase.showQuery'] : copy['chatResiduals.supabase.hideQuery']
                }
                className="flex min-h-11 w-full min-w-0 cursor-pointer items-center rounded-md bg-bolt-elements-background-depth-3 p-2 text-left outline-none hover:bg-bolt-elements-background-depth-4 focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <div className="i-ph:database mr-2 shrink-0 text-bolt-elements-textPrimary" aria-hidden></div>
                <span className="min-w-0 flex-grow break-words text-sm text-bolt-elements-textPrimary">
                  {description}
                </span>
                <div
                  className={`i-ph:caret-up text-bolt-elements-textPrimary transition-transform ${isCollapsed ? 'rotate-180' : ''}`}
                  aria-hidden
                ></div>
              </button>

              {!isCollapsed && content && (
                <div className="mt-2 max-h-60 overflow-auto rounded-md bg-bolt-elements-background-depth-4 p-3 font-mono text-xs text-bolt-elements-textSecondary">
                  <pre>{cleanSqlContent(content)}</pre>
                </div>
              )}
            </>
          )}
        </div>

        {/* Message and Actions */}
        <div className="p-4">
          <p className="mb-4 break-words text-sm text-bolt-elements-textSecondary">{message}</p>

          <div className="flex flex-wrap gap-2">
            {showConnectButton ? (
              <button
                type="button"
                onClick={handleConnectClick}
                className={classNames(
                  'min-h-11 min-w-0 whitespace-normal rounded-md px-3 py-2 text-sm font-medium',
                  'bg-[#098F5F]',
                  'hover:bg-[#0aa06c]',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
                  'text-white',
                  'flex items-center gap-1.5',
                )}
              >
                {copy['chatResiduals.supabase.connect']}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => executeSupabaseAction(cleanSqlContent(content))}
                disabled={isExecuting}
                className={classNames(
                  'min-h-11 min-w-0 whitespace-normal rounded-md px-3 py-2 text-sm font-medium',
                  'bg-[#098F5F]',
                  'hover:bg-[#0aa06c]',
                  'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500',
                  'text-white',
                  'flex items-center gap-1.5',
                  isExecuting ? 'opacity-70 cursor-not-allowed' : '',
                )}
              >
                {isExecuting ? copy['chatResiduals.supabase.applying'] : copy['chatResiduals.supabase.apply']}
              </button>
            )}
            <button
              type="button"
              onClick={clearAlert}
              disabled={isExecuting}
              className={classNames(
                'min-h-11 min-w-0 whitespace-normal rounded-md px-3 py-2 text-sm font-medium',

                /*
                 * Theme tokens instead of a hardcoded dark-brown bg — the old
                 * bg-[#503B26]/text-[#F79007] looked broken on the light theme.
                 */
                'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
                'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
                'text-bolt-elements-textSecondary',
                isExecuting ? 'opacity-70 cursor-not-allowed' : '',
              )}
            >
              {copy['chatResiduals.supabase.dismiss']}
            </button>
          </div>
          {executionError ? (
            <p role="alert" className="mt-3 break-words text-xs text-bolt-elements-icon-error">
              {executionError}
            </p>
          ) : null}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
