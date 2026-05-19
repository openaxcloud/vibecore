/* eslint-disable import/order */
import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { createDataStream, formatDataStreamPart, generateId } from 'ai';
import {
  agentMemoryAnnotation,
  persistAgentMemoryCandidate,
  retrieveMemoryForAgentContext,
} from '~/lib/.server/llm/agent-memory';
import {
  AgentExecutorError,
  areParallelSubagentsAvailable,
  buildAgentExecutionAnnotation,
  buildAgentOrchestrationPlan,
  createAgentExecutionContext,
  executeAgentOrchestration,
} from '~/lib/.server/llm/agent-orchestration';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS, type FileMap } from '~/lib/.server/llm/constants';
import { createSummary } from '~/lib/.server/llm/create-summary';
import { getFilePaths, selectContext } from '~/lib/.server/llm/select-context';
import { StreamRecoveryManager } from '~/lib/.server/llm/stream-recovery';
import { streamText, type Messages, type StreamingOptions } from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { extractPropertiesFromMessage } from '~/lib/.server/llm/utils';
import { recordChatUsage } from '~/lib/.server/ai-usage';
import { CONTINUE_PROMPT } from '~/lib/common/prompts/prompts';
import { MCPService } from '~/lib/services/mcpService';
import type { ContextAnnotation, ProgressAnnotation } from '~/types/context';
import { classifyStreamError, streamErrorCodeMessages } from '~/types/context';
import type { DesignScheme } from '~/types/design-scheme';
import type { IProviderSetting } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { WORK_DIR } from '~/utils/constants';
import {
  createPortfolioTemplateArtifact,
  createPortfolioTemplateStreamChunks,
  shouldUsePortfolioTemplate,
} from '~/utils/portfolio-template';

export async function action(args: ActionFunctionArgs) {
  return chatAction(args);
}

const logger = createScopedLogger('api.chat');
const RECENT_HISTORY_MESSAGES = 12;

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  const items = cookieHeader.split(';').map((cookie) => cookie.trim());

  items.forEach((item) => {
    const [name, ...rest] = item.split('=');

    if (name && rest) {
      const decodedName = decodeURIComponent(name.trim());
      const decodedValue = decodeURIComponent(rest.join('=').trim());
      cookies[decodedName] = decodedValue;
    }
  });

  return cookies;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  let clientDisconnected = false;

  const streamRecovery = new StreamRecoveryManager({
    timeout: 45000,
    maxRetries: 2,
    onTimeout: () => {
      logger.warn('Stream timeout - attempting recovery');
    },
  });

  if (request.signal) {
    const abortHandler = () => {
      clientDisconnected = true;
      streamRecovery.stop();
      logger.warn('Client disconnected - cancelling stream');
    };
    request.signal.addEventListener('abort', abortHandler, { once: true });
  }

  const { messages, files, promptId, projectId, contextOptimization, supabase, chatMode, designScheme, maxLLMSteps } =
    await request.json<{
      messages: Messages;
      files: any;
      promptId?: string;
      projectId?: string;
      contextOptimization: boolean;
      chatMode: 'discuss' | 'build';
      designScheme?: DesignScheme;
      supabase?: {
        isConnected: boolean;
        hasSelectedProject: boolean;
        credentials?: {
          anonKey?: string;
          supabaseUrl?: string;
        };
      };
      maxLLMSteps: number;
    }>();

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = JSON.parse(parseCookies(cookieHeader || '').apiKeys || '{}');

  const providerSettings: Record<string, IProviderSetting> = JSON.parse(
    parseCookies(cookieHeader || '').providers || '{}',
  );

  const stream = new SwitchableStream();

  const cumulativeUsage = {
    completionTokens: 0,
    promptTokens: 0,
    totalTokens: 0,
  };

  const encoder: TextEncoder = new TextEncoder();

  let progressCounter: number = 1;

  try {
    const mcpService = MCPService.getInstance();
    const totalMessageContent = messages.reduce((acc, message) => acc + message.content, '');
    logger.debug(`Total message length: ${totalMessageContent.split(' ').length}, words`);

    let lastChunk: string | undefined = undefined;

    const dataStream = createDataStream({
      async execute(dataStream) {
        streamRecovery.startMonitoring();

        if (shouldUsePortfolioTemplate({ messages, chatMode, files })) {
          const streamChunks = createPortfolioTemplateStreamChunks(messages);
          const assistantText = createPortfolioTemplateArtifact(messages);

          const zeroUsage = {
            completionTokens: 0,
            promptTokens: 0,
            totalTokens: 0,
          };

          dataStream.writeData({
            type: 'progress',
            label: 'portfolio-template',
            status: 'complete',
            order: progressCounter++,
            message: 'Loaded cached portfolio template',
          } satisfies ProgressAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'in-progress',
            order: progressCounter++,
            message: 'Streaming cached portfolio files',
          } satisfies ProgressAnnotation);

          for (const chunk of streamChunks) {
            dataStream.write(formatDataStreamPart('text', chunk));
            await new Promise((resolve) => setTimeout(resolve, 0));
          }

          streamRecovery.stop();
          dataStream.writeMessageAnnotation({
            type: 'usage',
            value: zeroUsage,
          });
          dataStream.writeData({
            type: 'progress',
            label: 'response',
            status: 'complete',
            order: progressCounter++,
            message: 'Response Generated',
          } satisfies ProgressAnnotation);
          dataStream.write(
            formatDataStreamPart('finish_step', {
              finishReason: 'stop',
              usage: {
                completionTokens: zeroUsage.completionTokens,
                promptTokens: zeroUsage.promptTokens,
              },
              isContinued: false,
            }),
          );
          dataStream.write(
            formatDataStreamPart('finish_message', {
              finishReason: 'stop',
              usage: {
                completionTokens: zeroUsage.completionTokens,
                promptTokens: zeroUsage.promptTokens,
              },
            }),
          );

          await persistAgentMemoryCandidate(request, {
            messages,
            assistantText,
            projectId,
          }).catch((error) => {
            logger.warn('Portfolio template memory persistence skipped', error);
          });

          return;
        }

        const filePaths = getFilePaths(files || {});

        let filteredFiles: FileMap | undefined = undefined;
        let summary: string | undefined = undefined;
        let messageSliceId = 0;

        const processedMessages = await mcpService.processToolInvocations(messages, dataStream);
        const agentMemory = await retrieveMemoryForAgentContext(request, { messages: processedMessages, projectId });

        if (agentMemory?.memories.length) {
          dataStream.writeMessageAnnotation(agentMemoryAnnotation(agentMemory.memories) as ContextAnnotation);
        }

        let orchestrationPlan = buildAgentOrchestrationPlan({
          messages: processedMessages,
          chatMode,
          subagentsAvailable: areParallelSubagentsAvailable(
            context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined,
          ),
        });

        let agentOrchestrationContext: string | undefined;

        if (orchestrationPlan.enabled) {
          if (orchestrationPlan.mode === 'parallel-subagents') {
            dataStream.writeData({
              type: 'progress',
              label: 'orchestration',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Executing specialist agent lanes',
            } satisfies ProgressAnnotation);

            try {
              const execution = await executeAgentOrchestration({
                env: context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined,
                plan: orchestrationPlan,
                messages: processedMessages,
              });
              agentOrchestrationContext = createAgentExecutionContext(execution);
              dataStream.writeMessageAnnotation(buildAgentExecutionAnnotation(execution) satisfies ContextAnnotation);
            } catch (error) {
              const message =
                error instanceof AgentExecutorError
                  ? `${error.message} Falling back to single-model lanes.`
                  : 'Sub-agent executor failed. Falling back to single-model lanes.';
              logger.warn(message);
              orchestrationPlan = {
                ...orchestrationPlan,
                mode: 'single-model-lanes',
                reason: message,
              };
            }
          }

          dataStream.writeMessageAnnotation({
            type: 'agentOrchestration',
            mode: orchestrationPlan.mode,
            reason: orchestrationPlan.reason,
            roles: orchestrationPlan.roles.map((role) => ({
              id: role.id,
              title: role.title,
              responsibility: role.responsibility,
            })),
          } satisfies ContextAnnotation);

          dataStream.writeData({
            type: 'progress',
            label: 'orchestration',
            status: 'complete',
            order: progressCounter++,
            message: `Agent lanes planned: ${orchestrationPlan.roles.map((role) => role.title).join(', ')}`,
          } satisfies ProgressAnnotation);
        }

        if (processedMessages.length > RECENT_HISTORY_MESSAGES) {
          messageSliceId = processedMessages.length - RECENT_HISTORY_MESSAGES;
        }

        if (filePaths.length > 0 && contextOptimization) {
          try {
            logger.debug('Generating Chat Summary');
            dataStream.writeData({
              type: 'progress',
              label: 'summary',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Analysing Request',
            } satisfies ProgressAnnotation);

            summary = await createSummary({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              apiKeys,
              providerSettings,
              promptId,
              contextOptimization,
              onFinish(resp) {
                if (resp.usage) {
                  logger.debug('createSummary token usage', JSON.stringify(resp.usage));
                  cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                  cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                  cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                }
              },
            });
            dataStream.writeData({
              type: 'progress',
              label: 'summary',
              status: 'complete',
              order: progressCounter++,
              message: 'Analysis Complete',
            } satisfies ProgressAnnotation);

            dataStream.writeMessageAnnotation({
              type: 'chatSummary',
              summary,
              chatId: processedMessages.slice(-1)?.[0]?.id,
            } as ContextAnnotation);

            logger.debug('Updating Context Buffer');
            dataStream.writeData({
              type: 'progress',
              label: 'context',
              status: 'in-progress',
              order: progressCounter++,
              message: 'Determining Files to Read',
            } satisfies ProgressAnnotation);

            filteredFiles = await selectContext({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              summary,
              onFinish(resp) {
                if (resp.usage) {
                  logger.debug('selectContext token usage', JSON.stringify(resp.usage));
                  cumulativeUsage.completionTokens += resp.usage.completionTokens || 0;
                  cumulativeUsage.promptTokens += resp.usage.promptTokens || 0;
                  cumulativeUsage.totalTokens += resp.usage.totalTokens || 0;
                }
              },
            });

            if (filteredFiles) {
              logger.debug(`files in context : ${JSON.stringify(Object.keys(filteredFiles))}`);
            }

            dataStream.writeMessageAnnotation({
              type: 'codeContext',
              files: Object.keys(filteredFiles).map((key) => {
                let path = key;

                if (path.startsWith(WORK_DIR)) {
                  path = path.replace(WORK_DIR, '');
                }

                return path;
              }),
            } as ContextAnnotation);

            dataStream.writeData({
              type: 'progress',
              label: 'context',
              status: 'complete',
              order: progressCounter++,
              message: 'Code Files Selected',
            } satisfies ProgressAnnotation);
          } catch (contextError) {
            logger.warn('Context optimization failed; continuing without selected context', contextError);
            filteredFiles = undefined;
            summary = undefined;
            dataStream.writeData({
              type: 'progress',
              label: 'context',
              status: 'complete',
              order: progressCounter++,
              message: 'Context optimization skipped',
            } satisfies ProgressAnnotation);
          }
        }

        const options: StreamingOptions = {
          supabaseConnection: supabase,
          toolChoice: 'auto',
          tools: mcpService.toolsWithoutExecute,
          maxSteps: maxLLMSteps,
          onStepFinish: ({ toolCalls }) => {
            // add tool call annotations for frontend processing
            toolCalls.forEach((toolCall) => {
              mcpService.processToolCall(toolCall, dataStream);
            });
          },
          onFinish: async ({ text: content, finishReason, usage }) => {
            logger.debug('usage', JSON.stringify(usage));

            if (usage) {
              cumulativeUsage.completionTokens += usage.completionTokens || 0;
              cumulativeUsage.promptTokens += usage.promptTokens || 0;
              cumulativeUsage.totalTokens += usage.totalTokens || 0;
            }

            if (finishReason !== 'length') {
              streamRecovery.stop();

              /*
               * Structured usage log so the local Cloud Logging metric still
               * fires even if the api-side ledger call below fails. This is
               * what C1.a wired; C1.b.3 now also POSTs to services/api so
               * the AiCostLedger + quota counters get the data.
               */
              const lastUserMessageForUsage = processedMessages.filter((x) => x.role === 'user').slice(-1)[0];

              const { provider: completionProvider, model: completionModel } = lastUserMessageForUsage
                ? extractPropertiesFromMessage(lastUserMessageForUsage)
                : { provider: 'unknown', model: 'unknown' };

              logger.info(
                JSON.stringify({
                  event: 'chat.completion.usage',
                  projectId,
                  chatMode,
                  finishReason,
                  provider: completionProvider,
                  model: completionModel,
                  promptTokens: cumulativeUsage.promptTokens,
                  completionTokens: cumulativeUsage.completionTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                  timestamp: new Date().toISOString(),
                }),
              );

              if (projectId) {
                // Fire-and-log: failures here never crash the chat stream.
                await recordChatUsage({
                  projectId,
                  provider: completionProvider,
                  model: completionModel,
                  inputTokens: cumulativeUsage.promptTokens,
                  outputTokens: cumulativeUsage.completionTokens,
                  finishReason,
                  cookieHeader: request.headers.get('Cookie') ?? undefined,
                  source: 'remix-chat',
                });
              }

              dataStream.writeMessageAnnotation({
                type: 'usage',
                value: {
                  completionTokens: cumulativeUsage.completionTokens,
                  promptTokens: cumulativeUsage.promptTokens,
                  totalTokens: cumulativeUsage.totalTokens,
                },
              });
              dataStream.writeData({
                type: 'progress',
                label: 'response',
                status: 'complete',
                order: progressCounter++,
                message: 'Response Generated',
              } satisfies ProgressAnnotation);
              await new Promise((resolve) => setTimeout(resolve, 0));
              await persistAgentMemoryCandidate(request, {
                messages: processedMessages,
                assistantText: content,
                projectId,
              });

              // stream.close();
              return;
            }

            if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
              throw Error('Cannot continue message: Maximum segments reached');
            }

            const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

            logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

            const lastUserMessage = processedMessages.filter((x) => x.role == 'user').slice(-1)[0];
            const { model, provider } = extractPropertiesFromMessage(lastUserMessage);
            processedMessages.push({ id: generateId(), role: 'assistant', content });
            processedMessages.push({
              id: generateId(),
              role: 'user',
              content: `[Model: ${model}]\n\n[Provider: ${provider}]\n\n${CONTINUE_PROMPT}`,
            });

            const result = await streamText({
              messages: [...processedMessages],
              env: context.cloudflare?.env,
              options,
              apiKeys,
              files,
              providerSettings,
              promptId,
              contextOptimization,
              contextFiles: filteredFiles,
              chatMode,
              designScheme,
              summary,
              messageSliceId,
              abortSignal: request.signal,
              agentOrchestrationPlan: orchestrationPlan,
              agentOrchestrationContext,
              agentMemoryContext: agentMemory?.context,
            });

            result.mergeIntoDataStream(dataStream);

            return;
          },
        };

        dataStream.writeData({
          type: 'progress',
          label: 'response',
          status: 'in-progress',
          order: progressCounter++,
          message: 'Generating Response',
        } satisfies ProgressAnnotation);

        const result = await streamText({
          messages: [...processedMessages],
          env: context.cloudflare?.env,
          options,
          apiKeys,
          files,
          providerSettings,
          promptId,
          contextOptimization,
          contextFiles: filteredFiles,
          chatMode,
          designScheme,
          summary,
          messageSliceId,
          agentOrchestrationPlan: orchestrationPlan,
          agentOrchestrationContext,
          agentMemoryContext: agentMemory?.context,
        });

        result.mergeIntoDataStream(dataStream);
      },
      onError: (error: any) => {
        streamRecovery.stop();

        const code = clientDisconnected ? 'STREAM_ABORTED' : classifyStreamError(error);
        const baseMessage = streamErrorCodeMessages[code];
        const detail = error?.message ? ` (${error.message})` : '';

        logger.info(`stream onError code=${code}${detail}`);

        return `Custom error: [${code}] ${baseMessage}`;
      },
    }).pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (!lastChunk) {
            lastChunk = ' ';
          }

          if (typeof chunk === 'string') {
            if (chunk.startsWith('g') && !lastChunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "<div class=\\"__boltThought__\\">"\n`));
            }

            if (lastChunk.startsWith('g') && !chunk.startsWith('g')) {
              controller.enqueue(encoder.encode(`0: "</div>\\n"\n`));
            }
          }

          lastChunk = chunk;

          let transformedChunk = chunk;

          if (typeof chunk === 'string' && chunk.startsWith('g')) {
            let content = chunk.split(':').slice(1).join(':');

            if (content.endsWith('\n')) {
              content = content.slice(0, content.length - 1);
            }

            transformedChunk = `0:${content}\n`;
          }

          // Convert the string stream to a byte stream
          const str = typeof transformedChunk === 'string' ? transformedChunk : JSON.stringify(transformedChunk);
          controller.enqueue(encoder.encode(str));
        },
      }),
    );

    return new Response(dataStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'Text-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    logger.error(error);

    const errorResponse = {
      error: true,
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
      isRetryable: error.isRetryable !== false, // Default to retryable unless explicitly false
      provider: error.provider || 'unknown',
    };

    if (error.message?.includes('API key')) {
      return new Response(
        JSON.stringify({
          ...errorResponse,
          message: 'Invalid or missing API key',
          statusCode: 401,
          isRetryable: false,
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          statusText: 'Unauthorized',
        },
      );
    }

    return new Response(JSON.stringify(errorResponse), {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' },
      statusText: 'Error',
    });
  }
}
