import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { useStore } from '@nanostores/react';
import type { JSONValue } from 'ai';
import type { Message } from 'ai';
import { memo, Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { toast } from 'react-toastify';
import { Markdown } from './Markdown';
import { MessagePatchReview } from './MessagePatchReview';
import { PlanChecklistView } from './PlanChecklist';
import ThoughtBox from './ThoughtBox';
import { ToolInvocations } from './ToolInvocations';
import { extractLaneStreamSummary, resolveLaneState } from './agent-lane-state';
import { ConnectionFailedNote } from './connector-cards/ConnectionFailedNote';
import { ConnectionRequestCard } from './connector-cards/ConnectionRequestCard';
import { ConnectionResolvedNote } from './connector-cards/ConnectionResolvedNote';
import { ReconnectionRequiredBanner } from './connector-cards/ReconnectionRequiredBanner';
import { SecretRequestCard } from './connector-cards/SecretRequestCard';
import Popover from '~/components/ui/Popover';
import WithTooltip from '~/components/ui/Tooltip';
import { extractAndStripPlanChecklist } from '~/lib/chat/plan-checklist';
import {
  formatAssistantCost,
  formatAssistantDuration,
  formatAssistantMessageCopy,
  formatAssistantTasksAgents,
  formatAssistantUsageNumber,
  getAssistantMessageCopy,
  localizeAssistantEnum,
  selectAssistantMessagePlural,
} from '~/lib/i18n/catalogs/assistant-message';
import { chatId } from '~/lib/persistence/useChatHistory';
import { streamingState } from '~/lib/stores/streaming';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ContextAnnotation, ToolCallAnnotation } from '~/types/context';
import type { ProviderInfo } from '~/types/model';
import { WORK_DIR } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

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
    const { i18n } = useTranslation();
    const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
    const copy = getAssistantMessageCopy(language);

    const text = (template: string, values: Readonly<Record<string, string | number>> = {}) =>
      formatAssistantMessageCopy(template, values);

    /*
     * Global streaming flag (set by Chat.client while a chat request is in
     * flight). Used to decide whether a parallel-agent lane still marked
     * 'running' is genuinely in-flight or stranded by a Stop/abort — see
     * resolveLaneState.
     */
    const isStreaming = useStore(streamingState);

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
    const agentPlan = filteredAnnotations.find((annotation) => annotation.type === 'agentPlan') as
      | Extract<ContextAnnotation, { type: 'agentPlan' }>
      | undefined;
    const agentRules = filteredAnnotations.find((annotation) => annotation.type === 'agentRules') as
      | Extract<ContextAnnotation, { type: 'agentRules' }>
      | undefined;

    /*
     * Live per-lane streaming: the executor emits agentLaneStream {kind} events —
     * 'start', 'delta' (new text chunk), 'done'. Concatenate the deltas per role
     * in annotation order so each specialist sub-agent renders token-by-token
     * while it works, Replit-style, before the final agentExecution arrives.
     */
    const agentLaneStreams = (() => {
      type AgentLaneStreamState = {
        roleId: Extract<ContextAnnotation, { type: 'agentLaneStream' }>['roleId'];
        title?: string;
        text: string;
        status: 'running' | 'complete' | 'partial' | 'failed';
        summary?: string;
      };

      const lanes = new Map<string, AgentLaneStreamState>();

      for (const annotation of filteredAnnotations) {
        if (annotation.type !== 'agentLaneStream') {
          continue;
        }

        const lane: AgentLaneStreamState = lanes.get(annotation.roleId) ?? {
          roleId: annotation.roleId,
          text: '',
          status: 'running',
        };

        if (annotation.kind === 'start') {
          lane.title = annotation.title ?? lane.title;
          lane.status = 'running';
        } else if (annotation.kind === 'delta') {
          lane.text += typeof annotation.text === 'string' ? annotation.text : '';
        } else if (annotation.kind === 'done') {
          lane.status = annotation.status ?? 'complete';
          lane.summary = annotation.summary;
        }

        lanes.set(annotation.roleId, lane);
      }

      return lanes.size > 0 ? [...lanes.values()] : undefined;
    })();
    const lanePanelRoles =
      agentOrchestration?.roles ??
      agentLaneStreams?.map((lane) => ({
        id: lane.roleId,
        title: lane.title ?? lane.roleId,
        responsibility: copy['assistantMessage.defaultLaneResponsibility'],
      })) ??
      [];

    const usage: {
      completionTokens: number;
      cost?: string | number;
      durationMs?: number;
      promptTokens: number;
      totalTokens: number;
    } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

    /*
     * Compact per-run chip ("$0.03 · 12.4k tokens · 41s") rendered under the
     * finished response; every part is optional so the chip only shows what
     * the stream actually reported, and hides entirely when nothing did.
     */
    /*
     * AGM routing chip: which MODE served this response (never a model name)
     * and the High-effort transparency signal — "+0 credit" when the switch was
     * on but the task did not need the escalation.
     */
    const agentModeRouting = filteredAnnotations.find((annotation) => annotation.type === 'agentModeRouting') as
      | {
          type: 'agentModeRouting';
          mode?: string;
          highEffort?: boolean;
          turbo?: boolean;
          escalated?: boolean;
          multiplier?: number;
          extraCharge?: boolean;
        }
      | undefined;

    const agentModeChipText = agentModeRouting
      ? [
          agentModeRouting.mode
            ? (copy[`assistantMessage.mode.${agentModeRouting.mode}` as keyof typeof copy] ??
              agentModeRouting.mode[0].toUpperCase() + agentModeRouting.mode.slice(1))
            : null,
          agentModeRouting.turbo ? copy['assistantMessage.mode.turbo'] : null,
          typeof agentModeRouting.multiplier === 'number' && agentModeRouting.multiplier !== 1
            ? `×${agentModeRouting.multiplier}`
            : null,
          agentModeRouting.highEffort
            ? agentModeRouting.escalated
              ? copy['assistantMessage.mode.escalated']
              : copy['assistantMessage.mode.noEscalation']
            : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const usageChipText = usage
      ? [
          typeof usage.cost === 'number' ? formatAssistantCost(usage.cost, language) : (usage.cost ?? null),
          usage.totalTokens
            ? text(copy['assistantMessage.usage.tokens'], {
                count: formatAssistantUsageNumber(usage.totalTokens, language) ?? usage.totalTokens,
              })
            : null,
          usage.durationMs ? formatAssistantDuration(usage.durationMs, language) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');

    /*
     * AI-SDK reasoning parts (extended thinking from reasoning-capable models)
     * were parsed but never rendered — only the legacy `__boltThought__` HTML
     * path showed thoughts. Surface them as collapsible "Reasoning" boxes so the
     * agent's thinking is visible (Replit/Cursor parity). `reasoning` is the
     * primary field; fall back to joining the structured `details` text parts.
     */
    const reasoningParts = (parts?.filter((part) => part.type === 'reasoning') ?? []) as ReasoningUIPart[];

    const reasoningTexts = reasoningParts
      .map((part) => {
        if (typeof part.reasoning === 'string' && part.reasoning.trim()) {
          return part.reasoning;
        }

        const details = (part as { details?: Array<{ type?: string; text?: string }> }).details;

        return Array.isArray(details)
          ? details
              .map((d) => (d?.type === 'text' && typeof d.text === 'string' ? d.text : ''))
              .join('')
              .trim()
          : '';
      })
      .filter((text) => text.length > 0);

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
          <div className="bolt-assistant-message-mobile-head" aria-hidden>
            <span className="i-ph:sparkle" />
            <strong>{copy['assistantMessage.agent']}</strong>
          </div>
          <div className="flex gap-1.5 items-center text-sm text-bolt-elements-textSecondary mb-1">
            {(codeContext || chatSummary || agentOrchestration || agentExecution || agentMemory || agentRules) && (
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
                    aria-label={copy['assistantMessage.context.show']}
                    title={copy['assistantMessage.context.show']}
                  >
                    <span className="i-ph:info" aria-hidden />
                    {/*
                     * Le déclencheur n'était qu'une icône « i » posée seule sur
                     * sa ligne : rien n'indiquait ce qu'elle ouvrait. Le libellé
                     * devient visible — l'aria-label seul ne sert que ceux qui
                     * n'ont justement pas besoin de deviner.
                     */}
                    <span className="bolt-message-context-trigger-label">{copy['assistantMessage.context.label']}</span>
                  </button>
                }
              >
                <div className="bolt-message-context-panel">
                  {agentMemory && (
                    <div className="agent-memory bolt-message-context-card">
                      <div>
                        <h2 className="bolt-message-context-title">{copy['assistantMessage.context.memoryTitle']}</h2>
                        <p className="bolt-message-context-subtitle">
                          {text(
                            selectAssistantMessagePlural(
                              copy,
                              'assistantMessage.context.memoriesUsed',
                              agentMemory.memories.length,
                            ),
                            {
                              count:
                                formatAssistantUsageNumber(agentMemory.memories.length, language) ??
                                agentMemory.memories.length,
                            },
                          )}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentMemory.memories.map((memory) => (
                          <div key={memory.id} className="bolt-message-context-item">
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">{memory.summary}</div>
                            <div className="bolt-message-context-meta">
                              {localizeAssistantEnum(copy, 'memoryScope', memory.scope)}
                              {memory.memoryType
                                ? ` · ${localizeAssistantEnum(copy, 'memoryType', memory.memoryType)}`
                                : ''}
                              {typeof memory.score === 'number'
                                ? ` · ${text(copy['assistantMessage.context.match'], {
                                    score:
                                      formatAssistantUsageNumber(Math.round(memory.score * 100), language) ??
                                      Math.round(memory.score * 100),
                                  })}`
                                : ''}
                              {typeof memory.accessCount === 'number'
                                ? ` · ${text(copy['assistantMessage.context.used'], {
                                    count:
                                      formatAssistantUsageNumber(memory.accessCount, language) ?? memory.accessCount,
                                  })}`
                                : ''}
                            </div>
                            {memory.tags?.length ? (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {memory.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded border border-bolt-elements-borderColor px-1 py-0.5 text-[11px] text-bolt-elements-textSecondary"
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
                  {agentRules && agentRules.files.length > 0 && (
                    <div className="agent-rules bolt-message-context-card">
                      <div>
                        <h2 className="bolt-message-context-title">{copy['assistantMessage.context.projectRules']}</h2>
                        <p className="bolt-message-context-subtitle">
                          {text(
                            selectAssistantMessagePlural(
                              copy,
                              'assistantMessage.context.rulesApplied',
                              agentRules.files.length,
                            ),
                            {
                              count:
                                formatAssistantUsageNumber(agentRules.files.length, language) ??
                                agentRules.files.length,
                            },
                          )}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {agentRules.files.map((path) => (
                          <span
                            key={path}
                            className="rounded border border-bolt-elements-borderColor px-1.5 py-0.5 text-[11px] font-medium text-bolt-elements-textSecondary"
                          >
                            {path}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {agentExecution && (
                    <div className="agent-execution bolt-message-context-card">
                      <div>
                        <h2 className="bolt-message-context-title">
                          {copy['assistantMessage.context.executionTitle']}
                        </h2>
                        <p className="bolt-message-context-subtitle">
                          {text(copy['assistantMessage.context.executionFinished'], {
                            runId: agentExecution.runId,
                            status: localizeAssistantEnum(copy, 'status', agentExecution.status),
                          })}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentExecution.results.map((result) => (
                          <div key={result.roleId} className="bolt-message-context-item">
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">
                              {localizeAssistantEnum(copy, 'role', result.roleId)} ·{' '}
                              {localizeAssistantEnum(copy, 'status', result.status)}
                            </div>
                            <div className="bolt-message-context-meta">{result.summary}</div>
                          </div>
                        ))}
                      </div>
                      {agentExecution.consensus && (
                        <div className="agent-consensus mt-3 pt-3 border-t border-bolt-elements-borderColor">
                          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                            <h3 className="text-xs font-medium text-bolt-elements-textPrimary">
                              {text(copy['assistantMessage.context.consensus'], {
                                algorithm: agentExecution.consensus.algorithm.toLowerCase().replaceAll('_', ' '),
                              })}
                            </h3>
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span
                                className={
                                  agentExecution.consensus.outcome === 'ACCEPTED'
                                    ? 'whitespace-nowrap text-[11px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                    : agentExecution.consensus.outcome === 'REJECTED'
                                      ? 'whitespace-nowrap text-[11px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-[var(--status-error-text)]'
                                      : 'whitespace-nowrap text-[11px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                }
                              >
                                {localizeAssistantEnum(copy, 'outcome', agentExecution.consensus.outcome)}
                              </span>
                              <span className="text-[11px] text-bolt-elements-textTertiary">
                                {text(
                                  selectAssistantMessagePlural(
                                    copy,
                                    'assistantMessage.context.agreementRounds',
                                    agentExecution.consensus.rounds,
                                  ),
                                  {
                                    score:
                                      formatAssistantUsageNumber(
                                        Math.round(agentExecution.consensus.agreementScore * 100),
                                        language,
                                      ) ?? Math.round(agentExecution.consensus.agreementScore * 100),
                                    count:
                                      formatAssistantUsageNumber(agentExecution.consensus.rounds, language) ??
                                      agentExecution.consensus.rounds,
                                  },
                                )}
                              </span>
                            </div>
                          </div>
                          {agentExecution.consensus.claimVotes.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary">
                                {text(
                                  selectAssistantMessagePlural(
                                    copy,
                                    'assistantMessage.context.claimsVoted',
                                    agentExecution.consensus.claimVotes.length,
                                  ),
                                  {
                                    count:
                                      formatAssistantUsageNumber(
                                        agentExecution.consensus.claimVotes.length,
                                        language,
                                      ) ?? agentExecution.consensus.claimVotes.length,
                                  },
                                )}
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
                                      aria-label={localizeAssistantEnum(copy, 'decision', vote.decision)}
                                    />
                                    <span className="font-mono text-[11px] text-bolt-elements-textTertiary">
                                      [{localizeAssistantEnum(copy, 'voteType', vote.type)}]
                                    </span>{' '}
                                    {vote.claim}{' '}
                                    <span className="text-[11px] text-bolt-elements-textTertiary">
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
                                {text(
                                  selectAssistantMessagePlural(
                                    copy,
                                    'assistantMessage.context.conflictsDetected',
                                    agentExecution.consensus.conflicts.length,
                                  ),
                                  {
                                    count:
                                      formatAssistantUsageNumber(agentExecution.consensus.conflicts.length, language) ??
                                      agentExecution.consensus.conflicts.length,
                                  },
                                )}
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
                                      aria-label={text(copy['assistantMessage.context.severity'], {
                                        severity: localizeAssistantEnum(copy, 'severity', conflict.severity),
                                      })}
                                    />
                                    <span className="font-mono text-[11px] text-bolt-elements-textTertiary">
                                      [{localizeAssistantEnum(copy, 'conflictType', conflict.type)}]
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
                        <h2 className="bolt-message-context-title">{copy['assistantMessage.context.orchestration']}</h2>
                        <p className="bolt-message-context-subtitle">
                          {agentOrchestration.mode === 'parallel-subagents'
                            ? copy['assistantMessage.context.parallelPlanned']
                            : copy['assistantMessage.context.lanesPlanned']}
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
                      <h2 className="bolt-message-context-title">{copy['assistantMessage.context.summary']}</h2>
                      <div className="bolt-message-context-markdown">
                        <Markdown>{chatSummary}</Markdown>
                      </div>
                    </div>
                  )}
                  {codeContext && (
                    <div className="code-context bolt-message-context-card">
                      <h2 className="bolt-message-context-title">{copy['assistantMessage.context.codeContext']}</h2>
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
                    {text(copy['assistantMessage.context.memoryUsed'], {
                      count:
                        formatAssistantUsageNumber(agentMemory.memories.length, language) ??
                        agentMemory.memories.length,
                    })}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
        {agentPlan?.tasks?.length
          ? (() => {
              /*
               * Live plan status: correlate each planned task with the matching
               * specialist lane's state (same data the "Parallel agents" panel
               * uses) so the checklist lights up pending → running → done as the
               * agents execute — instead of a static list. Only when we actually
               * have lane data (parallel-subagents run); otherwise the plan is
               * just a proposal and we show plain numbered steps.
               */
              const hasLaneData = Boolean(agentLaneStreams?.length || agentExecution);

              const stateForRole = (roleId: (typeof agentPlan.tasks)[number]['roleId']) => {
                if (!hasLaneData) {
                  return undefined;
                }

                const result = agentExecution?.results.find((r) => r.roleId === roleId);
                const stream = agentLaneStreams?.find((lane) => lane.roleId === roleId);

                return resolveLaneState({
                  resultStatus: result?.status,
                  streamStatus: stream?.status,
                  hasExecution: Boolean(agentExecution),
                  isStreaming,
                });
              };

              const iconForState = (state: ReturnType<typeof stateForRole>) =>
                state === 'running'
                  ? 'i-ph:circle-notch animate-spin text-bolt-elements-item-contentAccent'
                  : state === 'complete'
                    ? 'i-ph:check-circle text-emerald-500'
                    : state === 'partial'
                      ? 'i-ph:warning-circle text-amber-500'
                      : state === 'failed'
                        ? 'i-ph:x-circle text-red-500'
                        : 'i-ph:circle text-bolt-elements-textTertiary';

              const completed = hasLaneData
                ? agentPlan.tasks.filter((task) => stateForRole(task.roleId) === 'complete').length
                : 0;

              return (
                <div
                  className="bolt-agent-plan my-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
                  data-testid="agent-plan-panel"
                >
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-bolt-elements-textPrimary">
                    <span className="i-ph:list-checks text-bolt-elements-item-contentAccent" aria-hidden />
                    <span>{copy['assistantMessage.plan.title']}</span>
                    <span className="[margin-inline-start:auto] text-[11px] font-normal text-bolt-elements-textSecondary">
                      {hasLaneData
                        ? text(copy['assistantMessage.plan.done'], {
                            completed: formatAssistantUsageNumber(completed, language) ?? completed,
                            total:
                              formatAssistantUsageNumber(agentPlan.tasks.length, language) ?? agentPlan.tasks.length,
                          })
                        : formatAssistantTasksAgents(
                            copy,
                            agentPlan.tasks.length,
                            new Set(agentPlan.tasks.map((task) => task.roleId)).size,
                            language,
                          )}
                    </span>
                  </div>
                  <ol className="space-y-1">
                    {agentPlan.tasks.map((task, index) => {
                      const state = stateForRole(task.roleId);

                      return (
                        <li
                          key={`${task.roleId}-${index}`}
                          className="flex min-w-0 items-start gap-2 text-xs"
                          data-testid={`agent-plan-task-${index}`}
                          data-state={state ?? 'proposed'}
                        >
                          {state ? (
                            <span
                              className={`mt-[1px] shrink-0 ${iconForState(state)}`}
                              aria-label={localizeAssistantEnum(copy, 'status', state)}
                            />
                          ) : (
                            <span className="mt-[1px] shrink-0 text-bolt-elements-textTertiary">{index + 1}.</span>
                          )}
                          <span className="rounded bg-bolt-elements-background-depth-2 px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-bolt-elements-item-contentAccent">
                            {localizeAssistantEnum(copy, 'role', task.roleId)}
                          </span>
                          <span className="min-w-0 flex-1 break-words text-bolt-elements-textSecondary">
                            {task.title}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                  {agentPlan.needsApproval ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-bolt-elements-borderColor pt-2">
                      <span className="text-[11px] text-bolt-elements-textSecondary">
                        {copy['assistantMessage.plan.review']}
                      </span>
                      <button
                        type="button"
                        className="[margin-inline-start:auto] rounded-md bg-bolt-elements-button-primary-background px-2.5 py-1 text-xs font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover"
                        onClick={() => {
                          if (typeof window === 'undefined') {
                            return;
                          }

                          window.dispatchEvent(
                            new CustomEvent('vibecore:plan-approved', { detail: { tasks: agentPlan.tasks } }),
                          );
                        }}
                      >
                        {copy['assistantMessage.plan.approve']}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })()
          : null}
        {((agentOrchestration?.mode === 'parallel-subagents' && agentOrchestration.roles.length > 0) ||
          agentLaneStreams?.length) &&
          lanePanelRoles.length > 0 && (
            <div
              className="bolt-agent-lanes my-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3"
              data-testid="agent-lanes-panel"
            >
              <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-bolt-elements-textPrimary">
                <span className="i-ph:users-three text-bolt-elements-item-contentAccent" aria-hidden />
                <span>{copy['assistantMessage.lanes.title']}</span>
                <span className="min-w-0 truncate [margin-inline-start:auto] text-[11px] font-normal text-bolt-elements-textSecondary">
                  {agentExecution
                    ? text(copy['assistantMessage.lanes.consensusStatus'], {
                        status: agentExecution.consensus?.outcome
                          ? localizeAssistantEnum(copy, 'outcome', agentExecution.consensus.outcome)
                          : localizeAssistantEnum(copy, 'status', agentExecution.status),
                      })
                    : agentLaneStreams?.some((lane) => lane.status === 'running')
                      ? isStreaming
                        ? copy['assistantMessage.lanes.running']
                        : copy['assistantMessage.lanes.stopped']
                      : copy['assistantMessage.lanes.finalizing']}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                {lanePanelRoles.map((role) => {
                  const result = agentExecution?.results.find((r) => r.roleId === role.id);
                  const stream = agentLaneStreams?.find((lane) => lane.roleId === role.id);

                  const state = resolveLaneState({
                    resultStatus: result?.status,
                    streamStatus: stream?.status,
                    hasExecution: Boolean(agentExecution),
                    isStreaming,
                  });
                  const icon =
                    state === 'running'
                      ? 'i-ph:circle-notch animate-spin text-bolt-elements-item-contentAccent'
                      : state === 'complete'
                        ? 'i-ph:check-circle text-emerald-500'
                        : state === 'partial'
                          ? 'i-ph:warning-circle text-amber-500'
                          : 'i-ph:x-circle text-red-500';

                  return (
                    <div
                      key={role.id}
                      className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2"
                      data-testid={`agent-lane-${role.id}`}
                      data-state={state}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={icon} aria-hidden />
                        <span className="truncate text-xs font-medium text-bolt-elements-textPrimary">
                          {role.title}
                        </span>
                      </div>
                      <div className="mt-1 line-clamp-3 text-[11px] text-bolt-elements-textSecondary">
                        {result?.summary ??
                          stream?.summary ??
                          extractLaneStreamSummary(stream?.text) ??
                          role.responsibility}
                      </div>
                    </div>
                  );
                })}
              </div>
              {agentExecution?.consensus && (
                <div className="mt-2 text-[11px] text-bolt-elements-textSecondary">
                  {text(copy['assistantMessage.lanes.consensusSummary'], {
                    algorithm: agentExecution.consensus.algorithm.toLowerCase().replaceAll('_', ' '),
                    outcome: localizeAssistantEnum(copy, 'outcome', agentExecution.consensus.outcome),
                    score:
                      formatAssistantUsageNumber(Math.round(agentExecution.consensus.agreementScore * 100), language) ??
                      Math.round(agentExecution.consensus.agreementScore * 100),
                  })}
                </div>
              )}
            </div>
          )}
        {reasoningTexts.length > 0 && (
          <div className="bolt-assistant-reasoning my-2 space-y-2">
            {reasoningTexts.map((text, i) => (
              <ThoughtBox key={`reasoning-${i}`} title={copy['assistantMessage.reasoning']}>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-bolt-elements-textSecondary">
                  {text}
                </div>
              </ThoughtBox>
            ))}
          </div>
        )}
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
              const { payload } = annotation;

              switch (payload.kind) {
                case 'connection_request':
                  return <ConnectionRequestCard key={payload.messageId} payload={payload} />;
                case 'connection_resolved':
                  return <ConnectionResolvedNote key={payload.messageId} payload={payload} />;
                case 'connection_failed':
                  return <ConnectionFailedNote key={payload.messageId} payload={payload} />;
                case 'secret_request':
                  return <SecretRequestCard key={payload.messageId} payload={payload} />;
                case 'reconnection_required':
                  return <ReconnectionRequiredBanner key={payload.messageId} payload={payload} />;
                default:
                  return null;
              }
            })
          : null}
        {toolInvocations && toolInvocations.length > 0 && (
          <ToolInvocations
            toolInvocations={toolInvocations}
            toolCallAnnotations={toolCallAnnotations}
            addToolResult={addToolResult}
          />
        )}
        {agentModeChipText ? (
          <div
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-bolt-elements-textTertiary"
            style={{ fontFamily: 'var(--vc-font-code)' }}
            data-testid="agent-mode-chip"
            title={copy['assistantMessage.mode.tooltip']}
          >
            {agentModeChipText}
          </div>
        ) : null}
        {usageChipText ? (
          <Link
            to="/usage"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-bolt-elements-textTertiary transition-colors hover:text-bolt-elements-textSecondary"
            style={{ fontFamily: 'var(--vc-font-code)' }}
            title={text(copy['assistantMessage.usage.tooltip'], {
              prompt: formatAssistantUsageNumber(usage?.promptTokens ?? 0, language) ?? usage?.promptTokens ?? 0,
              completion:
                formatAssistantUsageNumber(usage?.completionTokens ?? 0, language) ?? usage?.completionTokens ?? 0,
            })}
            aria-label={text(copy['assistantMessage.usage.aria'], { usage: usageChipText })}
          >
            {usageChipText}
          </Link>
        ) : null}
        <AssistantMessageFooter content={content} messageId={messageId} onRewind={onRewind} onFork={onFork} />
      </div>
    );
  },
);

type Feedback = 'up' | 'down' | null;

const feedbackLogger = createScopedLogger('AssistantMessageFeedback');

/*
 * Fire-and-forget: a vote must never block or break the chat UI, so the
 * request outcome is only logged. The API keeps one vote per (user, message);
 * `vote: null` retracts a previously recorded vote (the thumb toggled off).
 */
function sendFeedbackVote(messageId: string, vote: Feedback) {
  if (typeof fetch === 'undefined') {
    return;
  }

  fetch('/api/ai/message-feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, vote, chatId: chatId.get() }),
  })
    .then((response) => {
      if (!response.ok) {
        feedbackLogger.warn(`Message feedback request failed with status ${response.status}`);
      }
    })
    .catch((error) => {
      feedbackLogger.warn('Message feedback request failed', error);
    });
}

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
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const copy = getAssistantMessageCopy(language);

  const text = useCallback(
    (template: string, values: Readonly<Record<string, string | number>> = {}) =>
      formatAssistantMessageCopy(template, values),
    [],
  );

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [copied, setCopied] = useState(false);

  const storageKey = messageId ? `ecode:feedback:${messageId}` : undefined;
  const legacyStorageKey = messageId ? `vibecore:msg-feedback:${messageId}` : undefined;

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') {
      return;
    }

    // Fall back to the pre-rebrand key so older local votes stay highlighted.
    const stored =
      window.localStorage.getItem(storageKey) ??
      (legacyStorageKey ? window.localStorage.getItem(legacyStorageKey) : null);

    if (stored === 'up' || stored === 'down') {
      setFeedback(stored);
    }
  }, [storageKey, legacyStorageKey]);

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

      // Clear the pre-rebrand key so it can't resurrect a retracted vote on mount.
      if (legacyStorageKey) {
        window.localStorage.removeItem(legacyStorageKey);
      }
    },
    [storageKey, legacyStorageKey],
  );

  /*
   * The double-vote guard is the localStorage entry: a stored vote renders the
   * thumb active on mount and a repeat click retracts instead of re-voting.
   * The side effects live outside the state updater so React StrictMode's
   * double-invoked updaters can't fire the POST twice.
   */
  const toggleFeedback = (value: Exclude<Feedback, null>) => {
    const next = feedback === value ? null : value;

    setFeedback(next);
    persistFeedback(next);

    if (messageId) {
      sendFeedbackVote(messageId, next);
    }
  };

  const copyMarkdown = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content ?? '');
      } else {
        throw new Error(copy['assistantMessage.footer.clipboardUnavailable']);
      }

      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (error) {
      const fallback = copy['assistantMessage.footer.copyFailedSafe'];
      toast.error(
        language.toLowerCase().startsWith('fr')
          ? fallback
          : text(copy['assistantMessage.footer.copyFailed'], {
              reason: error instanceof Error && error.message ? error.message : fallback,
            }),
      );
    }
  }, [content, copy, language, text]);

  if (!content && !messageId) {
    return null;
  }

  return (
    <div className="bolt-assistant-message-footer" role="group" aria-label={copy['assistantMessage.footer.group']}>
      <WithTooltip tooltip={copied ? copy['assistantMessage.footer.copied'] : copy['assistantMessage.footer.copy']}>
        <button
          type="button"
          aria-label={copy['assistantMessage.footer.copy']}
          className="bolt-assistant-message-action"
          data-copied={copied ? 'true' : 'false'}
          onClick={copyMarkdown}
        >
          <span className={copied ? 'i-ph:check' : 'i-ph:copy'} aria-hidden />
        </button>
      </WithTooltip>
      {onRewind && messageId ? (
        <WithTooltip tooltip={copy['assistantMessage.footer.regenerate']}>
          <button
            type="button"
            aria-label={copy['assistantMessage.footer.regenerate']}
            className="bolt-assistant-message-action"
            onClick={() => onRewind(messageId)}
          >
            <span className="i-ph:arrow-counter-clockwise" aria-hidden />
          </button>
        </WithTooltip>
      ) : null}
      {onFork && messageId ? (
        <WithTooltip tooltip={copy['assistantMessage.footer.forkTooltip']}>
          <button
            type="button"
            aria-label={copy['assistantMessage.footer.forkAria']}
            className="bolt-assistant-message-action"
            onClick={() => onFork(messageId)}
          >
            <span className="i-ph:pencil-simple" aria-hidden />
          </button>
        </WithTooltip>
      ) : null}
      <span className="bolt-assistant-message-action-divider" aria-hidden />
      <WithTooltip tooltip={copy['assistantMessage.footer.helpful']}>
        <button
          type="button"
          aria-label={copy['assistantMessage.footer.helpfulAria']}
          aria-pressed={feedback === 'up'}
          className="bolt-assistant-message-action"
          data-active={feedback === 'up' ? 'true' : 'false'}
          onClick={() => toggleFeedback('up')}
        >
          <span className="i-ph:thumbs-up" aria-hidden />
        </button>
      </WithTooltip>
      <WithTooltip tooltip={copy['assistantMessage.footer.improve']}>
        <button
          type="button"
          aria-label={copy['assistantMessage.footer.improveAria']}
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
