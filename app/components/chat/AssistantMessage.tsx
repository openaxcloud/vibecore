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
import { memo, Fragment } from 'react';
import { Markdown } from './Markdown';
import { ToolInvocations } from './ToolInvocations';
import Popover from '~/components/ui/Popover';
import WithTooltip from '~/components/ui/Tooltip';
import { workbenchStore } from '~/lib/stores/workbench';
import type { ContextAnnotation, ToolCallAnnotation } from '~/types/context';
import type { ProviderInfo } from '~/types/model';
import { WORK_DIR } from '~/utils/constants';

interface AssistantMessageProps {
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
      promptTokens: number;
      totalTokens: number;
    } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');

    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    return (
      <div className="bolt-assistant-message overflow-hidden w-full">
        <>
          <div className="flex gap-1.5 items-center text-sm text-bolt-elements-textSecondary mb-1">
            {(codeContext || chatSummary || agentOrchestration || agentExecution || agentMemory) && (
              <Popover side="right" align="start" trigger={<div className="i-ph:info" />}>
                <div className="max-w-chat">
                  {agentMemory && (
                    <div className="agent-memory flex flex-col gap-3 p-4 border border-bolt-elements-borderColor rounded-md mb-3">
                      <div>
                        <h2 className="text-sm font-medium text-bolt-elements-textPrimary">Agent memory</h2>
                        <p className="text-xs text-bolt-elements-textSecondary mt-1">
                          {agentMemory.memories.length} persistent memories used for this response
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentMemory.memories.map((memory) => (
                          <div
                            key={memory.id}
                            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2"
                          >
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">{memory.summary}</div>
                            <div className="text-xs text-bolt-elements-textSecondary mt-1">
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
                    <div className="agent-execution flex flex-col gap-3 p-4 border border-bolt-elements-borderColor rounded-md mb-3">
                      <div>
                        <h2 className="text-sm font-medium text-bolt-elements-textPrimary">Sub-agent execution</h2>
                        <p className="text-xs text-bolt-elements-textSecondary mt-1">
                          Run {agentExecution.runId} finished with status {agentExecution.status}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentExecution.results.map((result) => (
                          <div
                            key={result.roleId}
                            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2"
                          >
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">
                              {result.roleId} · {result.status}
                            </div>
                            <div className="text-xs text-bolt-elements-textSecondary mt-1">{result.summary}</div>
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
                    <div className="agent-orchestration flex flex-col gap-3 p-4 border border-bolt-elements-borderColor rounded-md mb-3">
                      <div>
                        <h2 className="text-sm font-medium text-bolt-elements-textPrimary">Agent orchestration</h2>
                        <p className="text-xs text-bolt-elements-textSecondary mt-1">
                          {agentOrchestration.mode === 'parallel-subagents'
                            ? 'Parallel specialist agents planned'
                            : 'Specialist lanes planned inside the active model'}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {agentOrchestration.roles.map((role) => (
                          <div
                            key={role.id}
                            className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2"
                          >
                            <div className="text-xs font-medium text-bolt-elements-textPrimary">{role.title}</div>
                            <div className="text-xs text-bolt-elements-textSecondary mt-1">{role.responsibility}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {chatSummary && (
                    <div className="summary max-h-96 flex flex-col">
                      <h2 className="border border-bolt-elements-borderColor rounded-md p4">Summary</h2>
                      <div style={{ zoom: 0.7 }} className="overflow-y-auto m4">
                        <Markdown>{chatSummary}</Markdown>
                      </div>
                    </div>
                  )}
                  {codeContext && (
                    <div className="code-context flex flex-col p4 border border-bolt-elements-borderColor rounded-md">
                      <h2>Context</h2>
                      <div className="flex gap-4 mt-4 bolt" style={{ zoom: 0.6 }}>
                        {codeContext.map((x) => {
                          const normalized = normalizedFilePath(x);
                          return (
                            <Fragment key={normalized}>
                              <code
                                className="bg-bolt-elements-artifacts-inlineCode-background text-bolt-elements-artifacts-inlineCode-text px-1.5 py-1 rounded-md text-bolt-elements-item-contentAccent hover:underline cursor-pointer"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  openArtifactInWorkbench(normalized);
                                }}
                              >
                                {normalized}
                              </code>
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <div className="context"></div>
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
                  <span>
                    Tokens: {usage.totalTokens} (prompt: {usage.promptTokens}, completion: {usage.completionTokens})
                  </span>
                )}
              </div>
              {(onRewind || onFork) && messageId && (
                <div className="flex gap-1.5 flex-col lg:flex-row ml-auto">
                  {onRewind && (
                    <WithTooltip tooltip="Revert to this message">
                      <button
                        onClick={() => onRewind(messageId)}
                        key="i-ph:arrow-u-up-left"
                        className="i-ph:arrow-u-up-left text-[19px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                  {onFork && (
                    <WithTooltip tooltip="Fork chat from this message">
                      <button
                        onClick={() => onFork(messageId)}
                        key="i-ph:git-fork"
                        className="i-ph:git-fork text-[19px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
        <Markdown append={append} chatMode={chatMode} setChatMode={setChatMode} model={model} provider={provider} html>
          {content}
        </Markdown>
        {toolInvocations && toolInvocations.length > 0 && (
          <ToolInvocations
            toolInvocations={toolInvocations}
            toolCallAnnotations={toolCallAnnotations}
            addToolResult={addToolResult}
          />
        )}
      </div>
    );
  },
);
