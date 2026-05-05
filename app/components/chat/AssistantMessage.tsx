import { memo, Fragment } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import Popover from '~/components/ui/Popover';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import WithTooltip from '~/components/ui/Tooltip';
import type { Message } from 'ai';
import type { ProviderInfo } from '~/types/model';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { ToolInvocations } from './ToolInvocations';
import type { ContextAnnotation, ToolCallAnnotation } from '~/types/context';

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
                              {typeof memory.score === 'number' ? ` · ${Math.round(memory.score * 100)}% match` : ''}
                            </div>
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
