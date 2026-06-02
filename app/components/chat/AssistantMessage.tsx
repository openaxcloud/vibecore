import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import type { JSONValue } from 'ai';
import type { Message } from 'ai';
import { memo, Fragment, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Markdown } from './Markdown';
import { MessagePatchReview } from './MessagePatchReview';
import { PlanChecklistView } from './PlanChecklist';
import { ToolInvocations } from './ToolInvocations';
import { ConnectionRequestCard } from './connector-cards/ConnectionRequestCard';
import Popover from '~/components/ui/Popover';
import WithTooltip from '~/components/ui/Tooltip';
import { extractAndStripPlanChecklist } from '~/lib/chat/plan-checklist';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ContextAnnotation, ToolCallAnnotation } from '~/types/context';
import type { ProviderInfo } from '~/types/model';
import { WORK_DIR } from '~/utils/constants';

export interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
  messageId?: string;
  onRewind?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function normalizedFilePath(path: string) {
  let normalizedPath = path;

  if (normalizedPath.startsWith(WORK_DIR)) {
    normalizedPath = path.replace(WORK_DIR, '');
  }

  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  return normalizedPath;
}

function formatUsageNumber(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value);
}

function formatDurationMs(value: number | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return undefined;
  }

  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
}

export const AssistantMessage = memo(
  ({
    content,
    annotations,
    messageId,
    onRewind,
    onFork,
    append,
    chatMode,
    setChatMode,
    model,
    provider,
    parts,
    addToolResult,
  }: AssistantMessageProps) => {
    const filteredAnnotations = (annotations?.filter(
      (annotation: JSONValue) =>
        annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
    ) || []) as { type: string; value: any } & { [key: string]: any }[];

    let chatSummary: string | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
      chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
    }

    let codeContext: string[] | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'codeContext')) {
      codeContext = filteredAnnotations.find((annotation) => annotation.type === 'codeContext')?.files;
    }

    const agentOrchestration = filteredAnnotations.find((annotation) => annotation.type === 'agentOrchestration') as
      | Extract<ContextAnnotation, { type: 'agentOrchestration' }>
      | undefined;
    const agentExecution = filteredAnnotations.find((annotation) => annotation.type === 'agentExecution') as
      | Extract<ContextAnnotation, { type: 'agentExecution' }>
      | undefined;
    const agentMemory = filteredAnnotations.find((annotation) => annotation.type === 'agentMemory') as
      | Extract<ContextAnnotation, { type: 'agentMemory' }>
      | undefined;

    const usage: {
      completionTokens: number;
      cost?: string | number;
      durationMs?: number;
      promptTokens: number;
      totalTokens: number;
    } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;
    const usageStats = usage
      ? [
          ['In', formatUsageNumber(usage.promptTokens)],
          ['Out', formatUsageNumber(usage.completionTokens)],
          ['Total', formatUsageNumber(usage.totalTokens)],
          ['Time', formatDurationMs(usage.durationMs)],
          ['Cost', typeof usage.cost === 'number' ? `$${usage.cost.toFixed(4)}` : usage.cost],
        ].filter(([, value]) => value)
      : [];

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');

    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    const connectorAnnotations = filteredAnnotations.filter(
      (annotation) =>
        annotation.type === 'connector' &&
        typeof annotation.payload === 'object' &&
        annotation.payload !== null &&
        typeof (annotation.payload as { kind?: unknown }).kind === 'string',
    ) as Array<{ type: 'connector'; payload: import('~/lib/chat/connector-messages').ConnectorAgentMessage }>;

    return (
      <div className="bolt-assistant-message overflow-hidden w-full">
        <>
          <div className="flex gap-1.5 items-center text-sm text-bolt-elements-textSecondary mb-1">
            {(codeContext || chatSummary || agentOrchestration || agentExecution || agentMemory) && (
              <Popover
                side="right"
                align="start"
                sideOffset={8}
                testId="agent-message-context-popover"
                contentClassName="bolt-message-context-popover"
                trigger={
                  <button
                    type="button"
                    className="bolt-message-context-trigger"
                    aria-label="Show agent message context"
                  >
                    <span className="i-ph:info" aria-hidden />
                  </button>
                }
              >
                <div className="bolt-message-context-panel">
                  {agentMemory && (
                    <div className="agent-memory bolt-message-context-card">
                      <div>
                        <h2 className="bolt-message-context-title">Agent memory</h2>
                        <p className="bolt-message-context-subtitle">
                          {agentMemory.memories.length} persistent memories used for this response
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentMemory.memories.map((memory) => (
                          <div key={memory.id} className="bolt-message-context-item">
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">{memory.summary}</div>
                            <div className="bolt-message-context-meta">
                              {memory.scope}
                              {memory.memoryType ? ` · ${memory.memoryType}` : ''}
                              {typeof memory.score === 'number' ? ` · ${Math.round(memory.score * 100)}% match` : ''}
                              {typeof memory.accessCount === 'number' ? ` · used ${memory.accessCount}x` : ''}
                            </div>
                            {memory.tags?.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {memory.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded border border-bolt-elements-borderColor px-1 py-0.5 text-[10px] text-bolt-elements-textSecondary"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {agentExecution && (
                    <div className="agent-execution bolt-message-context-card">
                      <div>
                        <h2 className="bolt-message-context-title">Sub-agent execution</h2>
                        <p className="bolt-message-context-subtitle">
                          Run {agentExecution.runId} finished with status {agentExecution.status}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentExecution.results.map((result) => (
                          <div key={result.roleId} className="bolt-message-context-item">
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">
                              {result.roleId} · {result.status}
                            </div>
                            <div className="bolt-message-context-meta">{result.summary}</div>
                          </div>
                        ))}
                      </div>
                      {agentExecution.consensus && (
                        <div className="agent-consensus mt-3 pt-3 border-t border-bolt-elements-borderColor">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                            <h3 className="text-xs font-medium text-bolt-elements-textPrimary">
                              Consensus · {agentExecution.consensus.algorithm.toLowerCase().replace('_', ' ')}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  agentExecution.consensus.outcome === 'ACCEPTED'
                                    ? 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : agentExecution.consensus.outcome === 'REJECTED'
                                      ? 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-600 dark:text-red-400'
                                      : 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                }
                              >
                                {agentExecution.consensus.outcome}
                              </span>
                              <span className="text-[10px] text-bolt-elements-textTertiary">
                                {Math.round(agentExecution.consensus.agreementScore * 100)}% agreement ·{' '}
                                {agentExecution.consensus.rounds} round
                                {agentExecution.consensus.rounds === 1 ? '' : 's'}
                              </span>
                            </div>
                          </div>
                          {agentExecution.consensus.claimVotes.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
                                {agentExecution.consensus.claimVotes.length} claim
                                {agentExecution.consensus.claimVotes.length === 1 ? '' : 's'} voted
                              </summary>
                              <ul className="mt-2 space-y-1 pl-3">
                                {agentExecution.consensus.claimVotes.map((vote, idx) => (
                                  <li
                                    key={`${vote.type}-${idx}`}
                                    className="text-[11px] text-bolt-elements-textSecondary"
                                  >
                                    <span
                                      className={
                                        vote.decision === 'accepted'
                                          ? 'inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle'
                                          : vote.decision === 'rejected'
                                            ? 'inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle'
                                            : 'inline-block w-1.5 h-1.5 rounded-full bg-zinc-400 mr-1.5 align-middle'
                                      }
                                      aria-label={vote.decision}
                                    />
                                    <span className="font-mono text-[10px] text-bolt-elements-textTertiary">
                                      [{vote.type}]
                                    </span>{' '}
                                    {vote.claim}{' '}
                                    <span className="text-[10px] text-bolt-elements-textTertiary">
                                      ({vote.supporters.length}/{vote.supporters.length + vote.dissenters.length})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                          {agentExecution.consensus.conflicts.length > 0 && (
                            <details className="text-xs mt-2">
                              <summary className="cursor-pointer text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
                                {agentExecution.consensus.conflicts.length} conflict
                                {agentExecution.consensus.conflicts.length === 1 ? '' : 's'} detected
                              </summary>
                              <ul className="mt-2 space-y-1 pl-3">
                                {agentExecution.consensus.conflicts.map((conflict, idx) => (
                                  <li key={`conflict-${idx}`} className="text-[11px] text-bolt-elements-textSecondary">
                                    <span
                                      className={
                                        conflict.severity === 'high'
                                          ? 'inline-block w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5 align-middle'
                                          : conflict.severity === 'medium'
                                            ? 'inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 align-middle'
                                            : 'inline-block w-1.5 h-1.5 rounded-full bg-zinc-400 mr-1.5 align-middle'
                                      }
                                      aria-label={`severity ${conflict.severity}`}
                                    />
                                    <span className="font-mono text-[10px] text-bolt-elements-textTertiary">
                                      [{conflict.type}]
                                    </span>{' '}
                                    {conflict.description}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {agentOrchestration && (
                    <div className="agent-orchestration bolt-message-context-card">
                      <div>
                        <h2 className="bolt-message-context-title">Agent orchestration</h2>
                        <p className="bolt-message-context-subtitle">
                          {agentOrchestration.mode === 'parallel-subagents'
                            ? 'Parallel specialist agents planned'
                            : 'Specialist lanes planned inside the active model'}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentOrchestration.roles.map((role) => (
                          <div key={role.id} className="bolt-message-context-item">
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">{role.title}</div>
                            <div className="bolt-message-context-meta">{role.responsibility}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatSummary && (
                    <div className="summary bolt-message-context-card">
                      <h2 className="bolt-message-context-title">Summary</h2>
                      <div className="bolt-message-context-markdown">
                        <Markdown>{chatSummary}</Markdown>
                      </div>
                    </div>
                  )}
                  {codeContext && (
                    <div className="code-context bolt-message-context-card">
                      <h2 className="bolt-message-context-title">Context</h2>
                      <div className="bolt-message-context-file-list">
                        {codeContext.map((x) => {
                          const normalized = normalizedFilePath(x);
                          return (
                            <Fragment key={normalized}>
                              <button
                                type="button"
                                className="bolt-message-context-file"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openArtifactInWorkbench(normalized);
                                }}
                              >
                                <code>{normalized}</code>
                              </button>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </Popover>
            )}
            <div className="flex w-full items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {agentMemory && (
                  <span className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-xs text-bolt-elements-textSecondary">
                    Memory used: {agentMemory.memories.length}
                  </span>
                )}
                {usage && (
                  <span
                    className="bolt-message-usage-stats"
                    aria-label={`Message usage: ${usageStats.map(([label, value]) => `${label} ${value}`).join(', ')}`}
                  >
                    {usageStats.map(([label, value]) => (
                      <span key={label}>
                        <strong>{label}</strong>
                        {value}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
        {(() => {
          /*
           * Sprint 5 wiring — if the message contains a parseable plan
           * checklist (markdown task list), render the structured
           * `<PlanChecklistView>` above the prose and pass only the
           * non-plan remainder to Markdown so we don't render the same
           * list twice. Streaming-safe: parsePlanChecklist tolerates
           * partial input (an in-flight `- [ ]` line missing a description
           * is just skipped).
           */
          const extracted = extractAndStripPlanChecklist(content);
          const markdownBody = extracted ? extracted.remainingText : content;

          return (
            <>
              {extracted ? <PlanChecklistView plan={extracted.plan} /> : null}
              {markdownBody ? (
                <Markdown
                  append={append}
                  chatMode={chatMode}
                  setChatMode={setChatMode}
                  model={model}
                  provider={provider}
                  html
                >
                  {markdownBody}
                </Markdown>
              ) : null}
            </>
          );
        })()}
        {messageId ? <MessagePatchReview messageId={messageId} content={content} parts={parts} /> : null}
        {connectorAnnotations.length > 0
          ? connectorAnnotations.map((annotation) => {
              if (annotation.payload.kind === 'connection_request') {
                return <ConnectionRequestCard key={annotation.payload.messageId} payload={annotation.payload} />;
              }

              /*
               * The connection_resolved / connection_failed / secret_request /
               * reconnection_required renderers ship in their own commits so the
               * chat falls through silently for now.
               */
              return null;
            })
          : null}
        {toolInvocations && toolInvocations.length > 0 && (
          <ToolInvocations
            toolInvocations={toolInvocations}
            toolCallAnnotations={toolCallAnnotations}
            addToolResult={addToolResult}
          />
        )}
        <AssistantMessageFooter content={content} messageId={messageId} onRewind={onRewind} onFork={onFork} />
      </div>
    );
  },
);

type Feedback = 'up' | 'down' | null;

function AssistantMessageFooter({
  content,
  messageId,
  onRewind,
  onFork,
}: {
  content: string;
  messageId?: string;
  onRewind?: (messageId: string) => void;
  onFork?: (messageId: string) => void;
}) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);

  const storageKey = messageId ? `vibecore:msg-feedback:${messageId}` : undefined;

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    const stored = window.localStorage.getItem(storageKey);

    if (stored === 'up' || stored === 'down') {
      setFeedback(stored);
    }
  }, [storageKey]);

  const persistFeedback = useCallback(
    (next: Feedback) => {
      if (!storageKey || typeof window === 'undefined') {
        return;
      }

      if (next) {
        window.localStorage.setItem(storageKey, next);
      } else {
        window.localStorage.removeItem(storageKey);
      }
    },
    [storageKey],
  );

  const toggleFeedback = (value: Exclude<Feedback, null>) => {
    setFeedback((current) => {
      const next = current === value ? null : value;
      persistFeedback(next);

      return next;
    });
  };

  const copyMarkdown = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content ?? '');
      } else {
        throw new Error('Clipboard API unavailable');
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      toast.error(`Copy failed: ${(error as Error).message}`);
    }
  }, [content]);

  if (!content && !messageId) {
    return null;
  }

  return (
    <div className="bolt-assistant-message-footer" role="group" aria-label="Message actions">
      <WithTooltip tooltip={copied ? 'Copied' : 'Copy message'}>
        <button
          type="button"
          aria-label="Copy message"
          className="bolt-assistant-message-action"
          data-copied={copied ? 'true' : 'false'}
          onClick={copyMarkdown}
        >
          <span className={copied ? 'i-ph:check' : 'i-ph:copy'} aria-hidden />
        </button>
      </WithTooltip>
      {onRewind && messageId ? (
        <WithTooltip tooltip="Regenerate from this prompt">
          <button
            type="button"
            aria-label="Regenerate from this prompt"
            className="bolt-assistant-message-action"
            onClick={() => onRewind(messageId)}
          >
            <span className="i-ph:arrow-counter-clockwise" aria-hidden />
          </button>
        </WithTooltip>
      ) : null}
      {onFork && messageId ? (
        <WithTooltip tooltip="Edit prompt and fork the conversation">
          <button
            type="button"
            aria-label="Edit prompt and fork conversation"
            className="bolt-assistant-message-action"
            onClick={() => onFork(messageId)}
          >
            <span className="i-ph:pencil-simple" aria-hidden />
          </button>
        </WithTooltip>
      ) : null}
      <span className="bolt-assistant-message-action-divider" aria-hidden />
      <WithTooltip tooltip="Helpful">
        <button
          type="button"
          aria-label="Mark response as helpful"
          aria-pressed={feedback === 'up'}
          className="bolt-assistant-message-action"
          data-active={feedback === 'up' ? 'true' : 'false'}
          onClick={() => toggleFeedback('up')}
        >
          <span className="i-ph:thumbs-up" aria-hidden />
        </button>
      </WithTooltip>
      <WithTooltip tooltip="Needs improvement">
        <button
          type="button"
          aria-label="Mark response as needing improvement"
          aria-pressed={feedback === 'down'}
          className="bolt-assistant-message-action"
          data-active={feedback === 'down' ? 'true' : 'false'}
          onClick={() => toggleFeedback('down')}
        >
          <span className="i-ph:thumbs-down" aria-hidden />
        </button>
      </WithTooltip>
    </div>
  );
}
