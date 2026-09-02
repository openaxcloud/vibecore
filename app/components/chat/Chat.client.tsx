/* eslint-disable import/order */
import { useChat } from '@ai-sdk/react';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import { useStore } from '@nanostores/react';
import { useSearchParams } from 'react-router';
import type { Message } from 'ai';
import { useAnimate } from 'framer-motion';
import Cookies from 'js-cookie';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import {
  classifySend,
  countResponseCompletions,
  isStreamStalled,
  RESPONSE_COMPLETE_GRACE_MS,
} from '~/lib/chat/composer-send-guard';
import { formatClientAstResidualCopy, getClientAstResidualCopy } from '~/lib/i18n/catalogs/client-ast-residual';
import { formatChatClientCopy, getChatClientCopy } from '~/lib/i18n/catalogs/chat-client';
import { BaseChat } from './BaseChat';
import type { ElementInfo } from '~/components/workbench/Inspector';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { useSettings } from '~/lib/hooks/useSettings';
import { chatMetadata, description, useChatHistory } from '~/lib/persistence';
import { getProjectIdeMemory, saveProjectIdeMemory } from '~/lib/persistence/projectIdeMemory';
import { chatStore } from '~/lib/stores/chat';
import { logStore } from '~/lib/stores/logs';
import { useMCPStore } from '~/lib/stores/mcp';
import { streamingState } from '~/lib/stores/streaming';
import { workbenchStore } from '~/lib/stores/workbench';
import { countWorkspaceFiles, decidePendingPromptReplay, resolvePendingPrompt } from '~/lib/runtime/pending-generation';
import { computeRewindTruncation } from '~/utils/chat-rewind';
import {
  DEFAULT_MODEL,
  DEFAULT_PROVIDER,
  MODEL_REGEX,
  PROMPT_COOKIE_KEY,
  PROVIDER_LIST,
  PROVIDER_REGEX,
} from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { debounce } from '~/utils/debounce';
import type { ProviderInfo } from '~/types/model';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { filesToArtifacts } from '~/utils/fileUtils';
import { supabaseConnection } from '~/lib/stores/supabase';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { LlmErrorAlertType } from '~/types/actions';
import { projectAiMessagesToChatMessages, type ProjectAiMessagesResponse } from './projectAiTranscript';
import { useProjectAiTranscriptHydration } from './useProjectAiTranscriptHydration';
import {
  projectModelSelectionFromMetadata,
  projectModelSelectionFromParams,
  projectModelSelectionFromValues,
  providerForModel,
} from './projectModelSelection';

const logger = createScopedLogger('Chat');
const MAX_PROJECT_ARCHIVED_CONVERSATIONS = 24;

/**
 * Deep-clone `value` into a strictly JSON-serializable shape: drop circular
 * references (tracked via a WeakSet), stringify BigInts, and drop functions /
 * undefined / symbols. Used only as a fallback when the /api/chat request body
 * would otherwise make JSON.stringify throw — never on the healthy path.
 */
function sanitizeForJson(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value === null || typeof value !== 'object') {
    // primitives (string/number/boolean) pass through; functions/symbols/undefined drop out via the caller.
    return typeof value === 'function' || typeof value === 'symbol' ? undefined : value;
  }

  if (seen.has(value)) {
    return undefined; // circular reference — the exact thing that makes JSON.stringify throw.
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForJson(item, seen) ?? null);
  }

  const out: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value)) {
    const cleaned = sanitizeForJson(item, seen);

    if (cleaned !== undefined) {
      out[key] = cleaned;
    }
  }

  return out;
}

/**
 * Guard the /api/chat request body against a non-serializable payload.
 *
 * The AI SDK dispatches the request as `fetch(api, { body: JSON.stringify(body) })`,
 * so JSON.stringify runs BEFORE fetch. A circular ref / BigInt anywhere in the
 * body (which can slip in after a project is reopened and its files/messages are
 * re-hydrated) makes JSON.stringify throw, fetch is never called (zero network),
 * and the SDK swallows the throw into onError — the "reopened project won't accept
 * edits" send-stall. This returns the body UNCHANGED (byte-identical) when it is
 * already serializable — so the OpenAI-certified request path is untouched — and
 * only when it would throw does it log the offending top-level key(s) and return a
 * sanitized clone so the POST still goes out instead of being silently lost.
 */
function ensureJsonSafeBody<T>(body: T, label: string): T | unknown {
  try {
    JSON.stringify(body);

    return body;
  } catch (err) {
    const culprits: string[] = [];

    if (body && typeof body === 'object') {
      for (const key of Object.keys(body as Record<string, unknown>)) {
        try {
          JSON.stringify((body as Record<string, unknown>)[key]);
        } catch {
          culprits.push(key);
        }
      }
    }

    console.error(
      `[send] ${label} request body is NOT JSON-serializable (offending key(s): ${
        culprits.join(', ') || 'unknown'
      }) — sanitizing so append() can POST instead of silently dropping the message:`,
      err,
    );

    return sanitizeForJson(body);
  }
}

function initialProjectModelSelection() {
  const metadataSelection = projectModelSelectionFromMetadata(chatMetadata.get());

  if (typeof window === 'undefined') {
    return metadataSelection;
  }

  return projectModelSelectionFromParams(new URLSearchParams(window.location.search)) ?? metadataSelection;
}

type ProjectAiConversationResponse = {
  conversation?: {
    id?: string;
  };
};

function projectAiTranscriptMessages(messages: Message[]) {
  return messages
    .filter((message) => !message.annotations?.includes('no-store'))
    .map((message, index) => {
      const role = String(message.role);

      if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'tool') {
        return undefined;
      }

      return {
        clientId: message.id || `${role}:${index}:${message.content.slice(0, 80)}`,
        role,
        content: message.content ?? '',
      };
    })
    .filter(
      (
        message,
      ): message is {
        clientId: string;
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
      } => Boolean(message),
    );
}

export function Chat({
  forceWorkbench = false,
  projectIdeMode = false,
  projectId,
  projectUrl,
  initialIdePanels,
}: {
  forceWorkbench?: boolean;
  projectIdeMode?: boolean;
  projectId?: string;
  projectUrl?: string;
  initialIdePanels?: Record<string, unknown>;
}) {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);

  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  if (!ready) {
    return (
      <BaseChat
        chatStarted={forceWorkbench}
        projectIdeMode={projectIdeMode}
        projectId={projectId}
        projectUrl={projectUrl}
        initialIdePanels={initialIdePanels}
      />
    );
  }

  return (
    <ChatImpl
      forceWorkbench={forceWorkbench}
      projectIdeMode={projectIdeMode}
      projectId={projectId}
      projectUrl={projectUrl}
      initialIdePanels={initialIdePanels}
      description={title}
      initialMessages={initialMessages}
      exportChat={exportChat}
      storeMessageHistory={storeMessageHistory}
      importChat={importChat}
    />
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    persistMessageHistory: (messages: Message[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, persistMessageHistory } = options;
    workbenchStore.setReloadedMessages(initialMessages.map((message) => message.id));
    parseMessages(messages, isLoading);

    if (messages.length > 0 && messages !== initialMessages) {
      void persistMessageHistory(messages);
    }
  },
  50,
);

interface ChatProps {
  forceWorkbench?: boolean;
  projectIdeMode?: boolean;
  projectId?: string;
  projectUrl?: string;
  initialIdePanels?: Record<string, unknown>;
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[]) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({
    forceWorkbench = false,
    projectIdeMode = false,
    projectId,
    projectUrl,
    initialIdePanels,
    description,
    initialMessages,
    storeMessageHistory,
    importChat,
    exportChat,
  }: ChatProps) => {
    useShortcuts();

    const { i18n } = useTranslation();
    const language = i18n.resolvedLanguage ?? i18n.language;
    const copy = getChatClientCopy(language);
    const astCopy = getClientAstResidualCopy(language);

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);

    /*
     * Souscrit, pas lu au vol : `chatMetadata.get()` ne déclenche aucun rendu,
     * si bien que l'hydratation de la transcription n'était jamais relancée
     * quand l'identifiant de conversation arrivait après le premier rendu.
     */
    const metadataAiConversationId = useStore(chatMetadata)?.aiConversationId;

    const files = useStore(workbenchStore.files);
    const filesHydrated = useStore(workbenchStore.filesHydrated);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);

    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );

    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const initialSelectionRef = useRef(projectIdeMode ? initialProjectModelSelection() : null);

    const [model, setModel] = useState(() => {
      if (initialSelectionRef.current?.model) {
        return initialSelectionRef.current.model;
      }

      const savedModel = Cookies.get('selectedModel');

      return savedModel || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      if (initialSelectionRef.current?.provider) {
        return initialSelectionRef.current.provider;
      }

      const savedProvider = Cookies.get('selectedProvider');
      const savedModel = Cookies.get('selectedModel') || DEFAULT_MODEL;
      const providerForSavedModel = providerForModel(savedModel);

      return (PROVIDER_LIST.find((p) => p.name === savedProvider) ||
        providerForSavedModel ||
        DEFAULT_PROVIDER) as ProviderInfo;
    });

    const { showChat } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');

    /*
     * Composer power controls + Plan toggle, mirrored from the values ChatBox /
     * BaseChat persist to localStorage. Held here (not just in ChatBox) so they
     * can be sent in the /api/chat body — previously these toggles were UI-only
     * and never reached the server. Kept in sync via the custom events those
     * components dispatch on change (decoupled, no prop threading through the
     * volatile BaseChat).
     */
    const [agentPower, setAgentPower] = useState<{
      buildTier?: 'lite' | 'economy' | 'power';
      highPowerModel?: boolean;
      extendedThinking?: boolean;
      turboMode?: boolean;
    } | null>(null);

    const [planFirstEnabled, setPlanFirstEnabled] = useState(false);

    /*
     * Per-request MCP server allow-list (null = all enabled). Synced from the
     * composer's MCP panel via localStorage + a custom event, like agentPower.
     */
    const [enabledMcpServers, setEnabledMcpServers] = useState<string[] | null>(null);

    useEffect(() => {
      if (typeof window === 'undefined') {
        return undefined;
      }

      const readAgentPower = () => {
        try {
          const raw = window.localStorage.getItem('vibecore.agentPower');
          setAgentPower(raw ? JSON.parse(raw) : null);
        } catch {
          // ignore malformed/blocked storage
        }
      };

      const readPlanFirst = () => {
        try {
          setPlanFirstEnabled(window.localStorage.getItem('vibecore:agent-plan-first-default') === 'true');
        } catch {
          // ignore
        }
      };

      const readMcpEnabled = () => {
        try {
          const raw = window.localStorage.getItem('vibecore.mcpEnabledServers');
          const parsed = raw ? JSON.parse(raw) : null;
          setEnabledMcpServers(Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : null);
        } catch {
          // ignore malformed/blocked storage
        }
      };

      readAgentPower();
      readPlanFirst();
      readMcpEnabled();

      const onPower = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        setAgentPower(detail && typeof detail === 'object' ? detail : null);
      };
      const onPlanFirst = (event: Event) => {
        setPlanFirstEnabled(Boolean((event as CustomEvent).detail));
      };
      const onMcpEnabled = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        setEnabledMcpServers(Array.isArray(detail) ? detail.filter((n) => typeof n === 'string') : null);
      };
      const onStorage = (event: StorageEvent) => {
        if (event.key === 'vibecore.agentPower') {
          readAgentPower();
        }

        if (event.key === 'vibecore:agent-plan-first-default') {
          readPlanFirst();
        }

        if (event.key === 'vibecore.mcpEnabledServers') {
          readMcpEnabled();
        }
      };

      window.addEventListener('vibecore:agent-power-change', onPower as EventListener);
      window.addEventListener('vibecore:plan-first-change', onPlanFirst as EventListener);
      window.addEventListener('vibecore:mcp-enabled-servers-change', onMcpEnabled as EventListener);
      window.addEventListener('storage', onStorage);

      return () => {
        window.removeEventListener('vibecore:agent-power-change', onPower as EventListener);
        window.removeEventListener('vibecore:plan-first-change', onPlanFirst as EventListener);
        window.removeEventListener('vibecore:mcp-enabled-servers-change', onMcpEnabled as EventListener);
        window.removeEventListener('storage', onStorage);
      };
    }, []);

    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const mcpSettings = useMCPStore((state) => state.settings);
    const latestMessagesRef = useRef<Message[]>(initialMessages);

    /*
     * Composer send-stall guard: `lastStreamActivityRef` records the last time a
     * chat stream delta arrived. A watchdog resets a stuck `isLoading` after a
     * stall, and `sendMessage` uses it to avoid silently swallowing a send when
     * the stream is dead. See app/lib/chat/composer-send-guard.ts.
     */
    const lastStreamActivityRef = useRef<number>(0);
    const stallWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

    /*
     * Fast-recovery for a stuck stream: `isLoadingRef` mirrors the latest
     * `isLoading` so a deferred timer reads the CURRENT value (not a stale
     * closure), and `handledCompletionsRef` tracks how many authoritative
     * terminal completions we've already acted on so we only react to a FRESH
     * one (a new completion this turn), never a stale one from a prior turn.
     */
    const isLoadingRef = useRef(false);
    const handledCompletionsRef = useRef(0);
    const pendingPersistRef = useRef<Message[] | null>(null);
    const persistInFlightRef = useRef<Promise<void> | null>(null);

    const backendAiConversationIdRef = useRef<string | undefined>(
      projectIdeMode ? chatMetadata.get()?.aiConversationId : undefined,
    );

    /*
     * Tracks an in-flight initial project generation (the queued pendingPrompt) so
     * onFinish/onError can decide whether to clear it. The prompt is the project's
     * only retry handle, so it is cleared ONLY once the agent has actually written a
     * file; a failed/empty/errored attempt keeps it so generation retries on the
     * next open instead of leaving the project stuck with just its seeded README.
     */
    const pendingGenerationRef = useRef<{ promptId: string; baselineFileCount: number } | null>(null);

    const ensureProjectAiConversation = useCallback(async () => {
      if (!projectIdeMode || !projectId) {
        return undefined;
      }

      const existingConversationId = backendAiConversationIdRef.current ?? chatMetadata.get()?.aiConversationId;

      if (existingConversationId) {
        backendAiConversationIdRef.current = existingConversationId;
        return existingConversationId;
      }

      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ai/conversations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: description?.trim() || copy['chatClient.project.agent'] }),
      });

      if (!response.ok) {
        throw new Error(
          formatClientAstResidualCopy(astCopy['clientAst.chat.technical.conversationCreate'], {
            status: response.status,
          }),
        );
      }

      const payload = (await response.json()) as ProjectAiConversationResponse;
      const conversationId = payload.conversation?.id;

      if (!conversationId) {
        throw Object.assign(new Error(), { code: 'CHAT_CONVERSATION_ID_MISSING' });
      }

      const nextMetadata = { ...(chatMetadata.get() ?? {}), aiConversationId: conversationId };
      chatMetadata.set(nextMetadata);
      backendAiConversationIdRef.current = conversationId;

      await saveProjectIdeMemory(projectId, {
        chat: {
          metadata: nextMetadata,
        },
      });

      return conversationId;
    }, [astCopy, copy, description, projectId, projectIdeMode]);

    const syncProjectAiTranscript = useCallback(
      async (nextMessages: Message[]) => {
        if (!projectIdeMode || !projectId || nextMessages.length === 0) {
          return;
        }

        const transcript = projectAiTranscriptMessages(nextMessages);

        if (transcript.length === 0) {
          return;
        }

        try {
          const conversationId = await ensureProjectAiConversation();

          if (!conversationId) {
            return;
          }

          const response = await fetch(
            `/api/projects/${encodeURIComponent(projectId)}/ai/conversations/${encodeURIComponent(
              conversationId,
            )}/transcript`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ messages: transcript }),
            },
          );

          if (!response.ok) {
            throw new Error(
              formatClientAstResidualCopy(astCopy['clientAst.chat.technical.transcriptSync'], {
                status: response.status,
              }),
            );
          }
        } catch (error) {
          logStore.logError('Failed to sync project AI transcript', error);
        }
      },
      [astCopy, ensureProjectAiConversation, projectId, projectIdeMode],
    );

    const persistMessageHistory = useCallback(
      (nextMessages: Message[]) => {
        pendingPersistRef.current = nextMessages;

        if (persistInFlightRef.current) {
          return persistInFlightRef.current;
        }

        const drainPendingSaves = async () => {
          while (pendingPersistRef.current) {
            const snapshot = pendingPersistRef.current;
            pendingPersistRef.current = null;
            await storeMessageHistory(snapshot);
            void syncProjectAiTranscript(snapshot);
          }
        };

        const savePromise = drainPendingSaves()
          .catch((error) => {
            logger.error('Failed to save chat history', error);
            toast.error(copy['chatClient.history.saveFailed']);
          })
          .finally(() => {
            persistInFlightRef.current = null;

            if (pendingPersistRef.current) {
              void persistMessageHistory(pendingPersistRef.current);
            }
          });

        persistInFlightRef.current = savePromise;

        return savePromise;
      },
      [copy, storeMessageHistory, syncProjectAiTranscript],
    );

    /*
     * Single source of truth for the /api/chat request body. Extracted so the
     * serializability guard in experimental_prepareRequestBody (below) can
     * reconstruct the EXACT payload the SDK would otherwise build — no drift on
     * the OpenAI-certified request path.
     */
    const chatRequestBodyBase = {
      apiKeys,
      files,
      promptId,
      contextOptimization: contextOptimizationEnabled,
      chatMode,
      projectId,
      designScheme,
      supabase: {
        isConnected: supabaseConn.isConnected,
        hasSelectedProject: !!selectedProject,
        credentials: {
          supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
          anonKey: supabaseConn?.credentials?.anonKey,
        },
      },
      maxLLMSteps: mcpSettings.maxLLMSteps,

      /*
       * Power controls + Plan toggle, now actually sent to the server so they
       * change the generation (parallel-agent count, planner role budget,
       * agentic depth, and forcing a plan pass). See api.chat.ts.
       */
      ...(agentPower ? { agentPower } : {}),
      planFirstEnabled,
      ...(enabledMcpServers ? { enabledMcpServers } : {}),
    };

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      body: chatRequestBodyBase,

      /*
       * Serializability guard on the request body — see ensureJsonSafeBody. This
       * reconstructs the EXACT body the SDK would otherwise build (id + messages +
       * data + our body base + per-request body) so there is no drift on the
       * OpenAI-certified path, then guards it: identity when already serializable,
       * sanitized-with-a-loud-log only when JSON.stringify would throw. This is the
       * fix for the reopened-project send-stall where append() produced zero POST.
       */
      experimental_prepareRequestBody: ({ id, messages: requestMessages, requestData, requestBody }) =>
        ensureJsonSafeBody(
          {
            id,
            messages: requestMessages,
            data: requestData,
            ...chatRequestBodyBase,
            ...(requestBody ?? {}),
          },
          '/api/chat',
        ),

      /*
       * Coalesce token-by-token stream updates into ~40ms frames. Without this
       * the AI SDK calls setMessages on EVERY SSE delta, so the full assistant
       * markdown tree re-parses + re-reconciles per token — the visible
       * stutter/saccade during generation. 40ms (~25fps) keeps streaming smooth
       * to the eye while cutting React work by an order of magnitude on fast
       * streams.
       */
      experimental_throttle: 40,
      sendExtraMessageFields: true,

      /*
       * DIAGNOSTIC (temporary): wrap the transport fetch so every request the AI
       * SDK actually dispatches to /api/chat is visible in the console. The SDK
       * builds the request as `fetch(api, { body: JSON.stringify(body), ... })`,
       * so JSON.stringify evaluates BEFORE fetch is called: a non-serializable
       * body (circular ref, BigInt, a Blob/File leaked into `files`) throws here,
       * fetch is never invoked (no network entry at all), and the throw is
       * swallowed into onError. If `[send] branch=append` logs but no
       * `[chat-fetch]` line follows, that pre-fetch throw is the cause — surfaced
       * loudly by the onError + serializability probes.
       */
      fetch: ((input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        console.info(`[chat-fetch] → ${url} method=${init?.method ?? 'GET'} aborted=${init?.signal?.aborted ?? 'n/a'}`);

        return window.fetch(input, init);
      }) as typeof fetch,
      onError: (e) => {
        console.error('[chat-onError] /api/chat request failed (may be a pre-fetch throw swallowed by the SDK):', e);
        setFakeLoading(false);

        /*
         * A dropped connection / stream error mid-generation never delivers the
         * closing </boltAction>, so any in-flight file actions would otherwise
         * spin forever. Abort them like a manual stop does.
         */
        workbenchStore.abortAllActions();
        handleError(e, 'chat');

        /*
         * A failed generation must not consume the project's queued prompt — drop
         * the in-flight marker but leave pendingPrompt in storage so the initial
         * app generation retries on the next open instead of stranding an empty project.
         */
        pendingGenerationRef.current = null;
        window.setTimeout(() => {
          const snapshot = latestMessagesRef.current;

          if (snapshot.length > 0) {
            void persistMessageHistory(snapshot);
          }
        }, 0);
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        /*
         * Fail-safe (LOT A): the stream reached its terminal finish, so the UI
         * MUST release regardless of what the post-finish workbench cleanup does.
         * A throw from finalizing a dangling/failed diff action below must never
         * leave `fakeLoading` (or the derived "Stop running" chip) stuck — reset it
         * FIRST, then run the cleanup defensively. The SDK already clears isLoading
         * on a clean finish; this guarantees the local loading flag can't outlive it.
         */
        setFakeLoading(false);

        /*
         * If the model finished cleanly mid-artifact (truncated output, hit a
         * stop sequence early), the closing </boltAction> never arrives and the
         * streamed file action is left spinning forever. Finalize only those
         * dangling file actions — running shell commands are left alone. Guarded:
         * a failure here cannot abort the rest of onFinish or wedge the release.
         */
        try {
          workbenchStore.abortStreamingFileActions();
        } catch (cleanupError) {
          console.error('[chat-onFinish] abortStreamingFileActions threw (ignored):', cleanupError);
        }
        window.setTimeout(() => {
          const snapshot = latestMessagesRef.current;

          if (snapshot.length > 0) {
            void persistMessageHistory(snapshot);
          }
        }, 0);

        const generation = pendingGenerationRef.current;

        if (generation && projectId) {
          /*
           * Resolve the queued initial-generation prompt. Let the streamed file
           * writes flush into the workbench file map, then clear the prompt ONLY if
           * the agent actually produced a file; if nothing was written (empty or
           * truncated response) keep it so generation retries on the next open.
           * Erring toward keep is safe — a redundant retry beats a stranded project.
           */
          window.setTimeout(() => {
            if (pendingGenerationRef.current?.promptId !== generation.promptId) {
              return;
            }

            pendingGenerationRef.current = null;

            const resolution = resolvePendingPrompt({
              baselineFileCount: generation.baselineFileCount,
              finalFileCount: countWorkspaceFiles(workbenchStore.files.get()),
              errored: false,
            });

            if (resolution === 'clear') {
              void saveProjectIdeMemory(projectId, { chat: { pendingPrompt: null } });
            }
          }, 1500);
        }

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');
      },
      initialMessages,
      initialInput: Cookies.get(PROMPT_COOKIE_KEY) || '',
    });

    /*
     * Record a stream heartbeat whenever `messages` change while loading: each
     * throttled delta frame updates `messages`, so this timestamps the last real
     * stream activity. Used by the stall watchdog + the send guard below.
     */
    useEffect(() => {
      if (isLoading) {
        lastStreamActivityRef.current = Date.now();
      }
    }, [messages, isLoading]);

    /*
     * Stall watchdog: while `isLoading`, poll for a dead stream (no delta for
     * STREAM_STALL_MS). A dropped LB/idle connection can leave `isLoading` stuck
     * true with no error/finish; force-stop so the composer is released and the
     * next send is not silently swallowed. Voluntary Stop is unaffected (it goes
     * through abort() directly, not this timer).
     */
    useEffect(() => {
      if (isLoading) {
        lastStreamActivityRef.current = Date.now();

        stallWatchdogRef.current = setInterval(() => {
          if (isStreamStalled(lastStreamActivityRef.current, Date.now())) {
            if (stallWatchdogRef.current) {
              clearInterval(stallWatchdogRef.current);
              stallWatchdogRef.current = null;
            }

            stop();
            setFakeLoading(false);
            workbenchStore.abortAllActions();
            toast.warning(copy['chatClient.generation.stalled']);
          }
        }, 10_000);
      }

      return () => {
        if (stallWatchdogRef.current) {
          clearInterval(stallWatchdogRef.current);
          stallWatchdogRef.current = null;
        }
      };
    }, [copy, isLoading, stop]);

    // Mirror isLoading into a ref so the completion timer below reads the live value.
    useEffect(() => {
      isLoadingRef.current = isLoading;
    }, [isLoading]);

    /*
     * Fast recovery from a dropped terminal close. The server writes an
     * authoritative `progress{label:'response',status:'complete'}` annotation
     * just before it closes a normal-finish stream. If that annotation arrives
     * but the terminal `finish_message`/close is then dropped by the LB, useChat
     * keeps `isLoading` true and the "Stop running" chip hangs for the full 50s
     * stall window — blocking the next send. When we see a FRESH completion (the
     * count rose since the last one handled), give a healthy stream a short grace
     * to close on its own, then force-release if it's still stuck. This never
     * truncates a healthy finish (isLoading flips false within the grace) and,
     * unlike lowering the stall watchdog, cannot false-positive on a slow stream
     * because it only arms after an explicit server completion signal.
     */
    useEffect(() => {
      const completions = countResponseCompletions(chatData);

      if (completions <= handledCompletionsRef.current) {
        return undefined;
      }

      handledCompletionsRef.current = completions;

      if (!isLoading) {
        return undefined;
      }

      const timer = setTimeout(() => {
        if (isLoadingRef.current) {
          stop();
          setFakeLoading(false);
        }
      }, RESPONSE_COMPLETE_GRACE_MS);

      return () => clearTimeout(timer);
    }, [chatData, isLoading, stop]);

    const submittedProjectPromptRef = useRef<string | undefined>(undefined);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    /*
     * Compact composer in the agent panel (UX refonte, point 3): auto-grows from
     * ~1 line up to ~4-5 lines (140px) then scrolls internally, instead of the big
     * 400px box that ate ~40% of a mobile screen. Standalone/landing composer keeps
     * the roomier sizing.
     */
    const TEXTAREA_MAX_HEIGHT = projectIdeMode ? 140 : chatStarted ? 400 : 200;

    useEffect(() => {
      latestMessagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
      Cookies.set('selectedModel', model, { expires: 30 });
      Cookies.set('selectedProvider', provider.name, { expires: 30 });

      if (!projectIdeMode || !projectId) {
        return;
      }

      const currentMetadata = chatMetadata.get() ?? {};

      if (currentMetadata.selectedModel === model && currentMetadata.selectedProvider === provider.name) {
        return;
      }

      const nextMetadata = {
        ...currentMetadata,
        selectedModel: model,
        selectedProvider: provider.name,
      };

      chatMetadata.set(nextMetadata);
      void saveProjectIdeMemory(projectId, {
        chat: {
          metadata: nextMetadata,
        },
      }).catch((error) => {
        logStore.logError('Failed to persist project AI model selection', error);
      });
    }, [model, projectId, projectIdeMode, provider.name]);

    useProjectAiTranscriptHydration({
      enabled: projectIdeMode,
      projectId,
      hasMessages: initialMessages.length > 0 || messages.length > 0,
      conversationId: metadataAiConversationId,
      resolveConversationId: () => backendAiConversationIdRef.current ?? chatMetadata.get()?.aiConversationId,
      loadTranscript: async (currentProjectId, conversationId) => {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(currentProjectId)}/ai/conversations/${encodeURIComponent(
            conversationId,
          )}/messages`,
        );

        if (!response.ok) {
          throw new Error(
            formatClientAstResidualCopy(astCopy['clientAst.chat.technical.transcriptLoad'], {
              status: response.status,
            }),
          );
        }

        const payload = (await response.json()) as ProjectAiMessagesResponse;

        return projectAiMessagesToChatMessages(payload.messages);
      },
      applyTranscript: async (backendMessages) => {
        setMessages(backendMessages);
        latestMessagesRef.current = backendMessages;
        setChatStarted(true);
        workbenchStore.setReloadedMessages(backendMessages.map((message) => message.id));
        await storeMessageHistory(backendMessages);
      },
      onLoadError: (error) => {
        logStore.logError('Failed to load project AI transcript', error);
      },
      onRetriesExhausted: (retry) => {
        toast.error(copy['chatClient.history.loadFailed'], {
          autoClose: false,
          onClick: retry,
          toastId: 'project-ai-transcript-error',
        });
      },
    });

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        persistMessageHistory,
      });
    }, [initialMessages, isLoading, messages, parseMessages, persistMessageHistory]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();

      /*
       * On the very first message, sendMessage() sets fakeLoading=true and then
       * awaits selectStarterTemplate()/getTemplates() (LLM calls) BEFORE any chat
       * request exists. During that window the composer shows a Stop button, but
       * stop() is a no-op (nothing in flight) and fakeLoading would stay true,
       * leaving the composer permanently stuck on Stop. Clear it here so a Stop
       * during template selection releases the composer; the `aborted` flag below
       * lets the in-flight template chain bail before it reload()s a generation.
       */
      setFakeLoading(false);
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      const snapshot = latestMessagesRef.current;

      if (snapshot.length > 0) {
        void persistMessageHistory(snapshot);
      }

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const lastAutoStreamRetryAtRef = useRef(0);

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        logger.error(`${context} request failed`, error);

        stop();
        setFakeLoading(false);

        let errorInfo = {
          message: error instanceof Error ? error.message : '',
          isRetryable: true,
          statusCode: 500,
          provider: provider.name,
          type: 'unknown' as const,
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);

            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        let errorType: LlmErrorAlertType['errorType'] = 'unknown';
        let title = copy['chatClient.error.title.request'];

        const lowerMessage = errorInfo.message.toLowerCase();
        const rawCode = (errorInfo as { code?: unknown }).code;
        const errorCode = typeof rawCode === 'string' ? rawCode : '';

        if (errorInfo.statusCode === 401 || lowerMessage.includes('api key')) {
          errorType = 'authentication';
          title = copy['chatClient.error.title.authentication'];
        } else if (errorCode === 'QUOTA_EXCEEDED' || lowerMessage.includes('quota')) {
          /*
           * A plan/org quota exhaustion surfaces as a 429 too, but it is NOT a
           * transient provider rate-limit — waiting will not clear it (it refills
           * next billing period). Classify it as 'quota' BEFORE the generic 429
           * branch so we don't mislabel an exhausted org allowance as an upstream
           * provider rate-limit (e.g. "Rate limit exceeded for OpenAI"), which
           * sends users chasing a non-existent provider outage.
           */
          errorType = 'quota';
          title = copy['chatClient.error.title.quota'];
        } else if (errorInfo.statusCode === 429 || lowerMessage.includes('rate limit')) {
          errorType = 'rate_limit';
          title = copy['chatClient.error.title.rateLimit'];
        } else if (errorInfo.statusCode >= 500) {
          errorType = 'network';
          title = copy['chatClient.error.title.server'];
        }

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: errorInfo.message,
          context,
          retryable: errorInfo.isRetryable,
          errorType,
          provider: provider.name,
        });

        /*
         * Auto-retry once on a TRANSIENT error (network/5xx/provider rate-limit)
         * before bothering the user — these usually clear on a second attempt, so
         * project creation shouldn't hard-fail on a blip. Time-boxed (one retry per
         * 30s window) so a persistent failure can't loop; quota/auth/token errors
         * are not transient and fall straight through to the alert.
         */
        const isTransient =
          (errorType === 'network' || errorType === 'rate_limit') &&
          errorInfo.isRetryable !== false &&
          context === 'chat';

        const now = Date.now();

        if (isTransient && now - lastAutoStreamRetryAtRef.current > 30_000) {
          lastAutoStreamRetryAtRef.current = now;
          logger.warn(`Transient ${errorType} stream error — auto-retrying once`);
          setData([]);
          void reload();

          return;
        }

        // Create API error alert
        setLlmErrorAlert({
          type: 'error',
          title,
          description: '',
          provider: provider.name,
          errorType,
        });
        setData([]);
      },
      [copy, provider.name, stop, reload],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    /*
     * One-click Retry from the LLM error alert (LLMApiAlert dispatches this event
     * so it doesn't need a callback threaded through the volatile BaseChat). Clear
     * the alert and re-run the last generation.
     */
    useEffect(() => {
      const onRetry = () => {
        setLlmErrorAlert(undefined);
        void reload();
      };

      window.addEventListener('vibecore:llm-retry', onRetry);

      return () => window.removeEventListener('vibecore:llm-retry', onRetry);
    }, [reload]);

    /*
     * Retry with a DIFFERENT model from the LLM error alert. reload() re-sends the
     * existing messages as-is, and the server reads the model/provider from the
     * LAST user message's [Model:]/[Provider:] tags — so we must REWRITE those tags
     * to the chosen model before reloading, otherwise the failed model is reused.
     */
    useEffect(() => {
      const onRetryWithModel = (event: Event) => {
        const detail = (event as CustomEvent<{ model?: string; provider?: string }>).detail;
        const nextModel = detail?.model?.trim();
        const nextProvider = detail?.provider?.trim();

        if (!nextModel || !nextProvider) {
          return;
        }

        const current = latestMessagesRef.current;
        const lastUserIndex = [...current].map((message) => message.role).lastIndexOf('user');

        if (lastUserIndex < 0) {
          return;
        }

        const target = current[lastUserIndex];

        const rawContent =
          typeof target.content === 'string'
            ? target.content
            : Array.isArray(target.content)
              ? ((target.content as Array<{ type?: string; text?: string }>).find((part) => part.type === 'text')
                  ?.text ?? '')
              : '';

        const cleaned = rawContent.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');
        const rewritten = `[Model: ${nextModel}]\n\n[Provider: ${nextProvider}]\n\n${cleaned}`;

        const updated = current.map((message, index) =>
          index === lastUserIndex ? { ...message, content: rewritten } : message,
        );

        setLlmErrorAlert(undefined);
        setModel(nextModel);

        const providerObj = (PROVIDER_LIST.find((entry) => entry.name === nextProvider) ??
          providerForModel(nextModel)) as ProviderInfo;

        if (providerObj) {
          setProvider(providerObj);
          Cookies.set('selectedProvider', providerObj.name, { expires: 30 });
        }

        Cookies.set('selectedModel', nextModel, { expires: 30 });

        setMessages(updated);
        void persistMessageHistory(updated);
        void reload();
      };

      window.addEventListener('vibecore:llm-retry-with-model', onRetryWithModel as EventListener);

      return () => window.removeEventListener('vibecore:llm-retry-with-model', onRetryWithModel as EventListener);
    }, [reload, setMessages, persistMessageHistory, setModel, setProvider]);

    /*
     * Plan-approval gate (step 2): the user approved a proposed plan (Plan mode).
     * Re-run the same turn, this time carrying planApproved + the approved tasks in
     * the request body override, so the server skips re-planning and executes the
     * exact decomposition the user reviewed. reload() regenerates the last turn
     * from the last user message; the body override is merged for this request.
     */
    useEffect(() => {
      const onPlanApproved = (event: Event) => {
        if (isLoading) {
          return;
        }

        const detail = (event as CustomEvent<{ tasks?: Array<{ title: string; roleId: string }> }>).detail;
        const tasks = detail?.tasks;

        if (!tasks?.length) {
          return;
        }

        void reload({ body: { planApproved: true, approvedPlanTasks: tasks } });
      };

      window.addEventListener('vibecore:plan-approved', onPlanApproved as EventListener);

      return () => window.removeEventListener('vibecore:plan-approved', onPlanApproved as EventListener);
    }, [reload, isLoading]);

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    /*
     * Phase 0 #6 — framer-motion's `animate(selector, …)` throws when the
     * selector matches zero elements (v11+ behaviour). The intro/examples
     * DOM is conditionally rendered, so a navigation that cleaned it up
     * before this runs would blow up the chat boot. Guard each call and
     * swallow framer's empty-target error without failing the boot.
     */
    const animateIfPresent = (
      selector: string,
      keyframes: Parameters<typeof animate>[1],
      options?: Parameters<typeof animate>[2],
    ): Promise<void> => {
      if (typeof document === 'undefined' || !document.querySelector(selector)) {
        return Promise.resolve();
      }

      try {
        return Promise.resolve(animate(selector, keyframes, options)).then(
          () => undefined,
          (error) => {
            logger.warn('chat boot animation skipped', { selector, error });
          },
        );
      } catch (error) {
        logger.warn('chat boot animation threw', { selector, error });

        return Promise.resolve();
      }
    };

    const runAnimation = async () => {
      if (chatStarted) {
        return;
      }

      await Promise.all([
        animateIfPresent('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animateIfPresent('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);

      setChatStarted(true);
    };

    useEffect(() => {
      let cancelled = false;

      if (!projectIdeMode || !projectId) {
        return () => {
          cancelled = true;
        };
      }

      getProjectIdeMemory(projectId)
        .then((memory) => {
          if (cancelled) {
            return;
          }

          const pendingPrompt = memory.chat?.pendingPrompt;
          const prompt = pendingPrompt?.prompt?.trim();

          if (!pendingPrompt || !prompt) {
            return;
          }

          const promptKey = `${projectId}:pending:${pendingPrompt.id}`;

          if (submittedProjectPromptRef.current === promptKey) {
            return;
          }

          /*
           * The pendingPrompt clear is best-effort (a delayed onFinish timer that can
           * be lost if the tab closes right after files were written, or if the save
           * fails). On reopen the file map starts EMPTY and is filled asynchronously,
           * so we must not decide off a not-yet-hydrated snapshot: a 0-file map then
           * looks "ungenerated" and would regenerate over the existing app.
           *
           *   - 'defer'  : files not confirmed hydrated yet — do nothing (no replay,
           *                no clear). The effect re-runs when `filesHydrated` flips.
           *   - 'skip'   : hydration revealed a real app — clear the stale prompt.
           *   - 'replay' : hydration revealed an empty/scaffold project — generate.
           */
          const replayDecision = decidePendingPromptReplay(workbenchStore.files.get(), filesHydrated);

          if (replayDecision === 'defer') {
            return;
          }

          if (replayDecision === 'skip') {
            submittedProjectPromptRef.current = promptKey;
            void saveProjectIdeMemory(projectId, { chat: { pendingPrompt: null } }).catch((error) => {
              logger.warn('failed to clear stale pending prompt', { projectId, error });
            });

            return;
          }

          submittedProjectPromptRef.current = promptKey;

          const requestedSelection = projectModelSelectionFromValues(pendingPrompt.model, pendingPrompt.provider);
          const selectedModel = requestedSelection?.model ?? model;
          const selectedProvider = requestedSelection?.provider ?? provider;

          if (requestedSelection) {
            setModel(selectedModel);
            setProvider(selectedProvider);
            Cookies.set('selectedModel', selectedModel, { expires: 30 });
            Cookies.set('selectedProvider', selectedProvider.name, { expires: 30 });
          }

          if (pendingPrompt.aiFallback) {
            toast.warn(copy['chatClient.project.aiFallback'], { autoClose: 8000 });
          }

          runAnimation();

          /*
           * Mark the generation in-flight with the current file count as a baseline
           * instead of clearing the prompt now. onFinish clears pendingPrompt once
           * the agent has written at least one file; a failed/empty attempt leaves it
           * in storage so generation retries on the next open (no stranded project).
           */
          pendingGenerationRef.current = {
            promptId: pendingPrompt.id,
            baselineFileCount: countWorkspaceFiles(workbenchStore.files.get()),
          };

          append({
            role: 'user',
            content: prompt,
          });
        })
        .catch((error) => {
          logger.warn('failed to load queued project prompt', { projectId, error });
        });

      return () => {
        cancelled = true;
      };
    }, [append, copy, model, projectId, projectIdeMode, provider, runAnimation, filesHydrated]);

    useEffect(() => {
      const prompt = searchParams.get('prompt')?.trim();
      const requestedSelection = projectModelSelectionFromParams(searchParams);

      if (!projectIdeMode || !projectId || !prompt) {
        return;
      }

      const promptKey = `${projectId}:${prompt}`;

      if (submittedProjectPromptRef.current === promptKey) {
        return;
      }

      /*
       * Same hydration gate as the sibling pendingPrompt effect (above): on reopen
       * the file map starts EMPTY and fills asynchronously, so deciding off a
       * not-yet-hydrated snapshot regenerates over an app that already exists the
       * instant its files load (clobbering files + double-charging tokens).
       *
       *   - 'defer'  : files not confirmed hydrated yet — do nothing (no generate,
       *                no clear); the effect re-runs when `filesHydrated` flips.
       *   - 'skip'   : hydration revealed a real app — clear the ?prompt= param so
       *                it doesn't linger, WITHOUT regenerating.
       *   - 'replay' : hydration revealed an empty/scaffold project — generate once.
       */
      const replayDecision = decidePendingPromptReplay(workbenchStore.files.get(), filesHydrated);

      if (replayDecision === 'defer') {
        return;
      }

      const clearPromptParams = () => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('prompt');
        nextParams.delete('model');
        nextParams.delete('provider');
        setSearchParams(nextParams, { replace: true });
      };

      if (replayDecision === 'skip') {
        submittedProjectPromptRef.current = promptKey;
        clearPromptParams();

        return;
      }

      submittedProjectPromptRef.current = promptKey;

      const selectedModel = requestedSelection?.model ?? model;
      const selectedProvider = requestedSelection?.provider ?? provider;

      if (requestedSelection) {
        setModel(selectedModel);
        setProvider(selectedProvider);
        Cookies.set('selectedModel', selectedModel, { expires: 30 });
        Cookies.set('selectedProvider', selectedProvider.name, { expires: 30 });
      }

      runAnimation();
      append({
        role: 'user',
        content: prompt,
      });

      clearPromptParams();
    }, [
      append,
      model,
      projectId,
      projectIdeMode,
      provider.name,
      runAnimation,
      searchParams,
      setSearchParams,
      filesHydrated,
    ]);

    useEffect(() => {
      const requestedSelection = projectModelSelectionFromParams(searchParams);

      if (!projectIdeMode || !requestedSelection || searchParams.has('prompt')) {
        return;
      }

      setModel(requestedSelection.model);
      setProvider(requestedSelection.provider);
      Cookies.set('selectedModel', requestedSelection.model, { expires: 30 });
      Cookies.set('selectedProvider', requestedSelection.provider.name, { expires: 30 });

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('model');
      nextParams.delete('provider');
      setSearchParams(nextParams, { replace: true });
    }, [projectIdeMode, searchParams, setSearchParams]);

    useEffect(() => {
      if (!projectIdeMode || !searchParams.has('promptQueueError')) {
        return;
      }

      toast.error(copy['chatClient.project.promptQueueFailed'], { autoClose: 8000 });

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('promptQueueError');
      setSearchParams(nextParams, { replace: true });
    }, [copy, projectIdeMode, searchParams, setSearchParams]);

    useEffect(() => {
      if (!projectIdeMode || searchParams.get('aiFallback') !== 'true') {
        return;
      }

      toast.warn(copy['chatClient.project.aiFallback'], { autoClose: 8000 });

      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('aiFallback');
      nextParams.delete('aiFallbackReason');
      setSearchParams(nextParams, { replace: true });
    }, [copy, projectIdeMode, searchParams, setSearchParams]);

    // Helper function to create message parts array from text and images
    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      // Create an array of properly typed message parts
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      // Add image parts if any
      images.forEach((imageData) => {
        // Extract correct MIME type from the data URL
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        // Create file part according to AI SDK format
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    // Helper function to convert File[] to Attachment[] for AI SDK
    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) {
        return undefined;
      }

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment | undefined>((resolve) => {
              const reader = new FileReader();

              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };

              /*
               * Without an onerror handler a failed read (file moved/deleted between
               * selection and send, IO/permission error) would never settle this
               * Promise, so Promise.all() — and the awaiting sendMessage() — would
               * hang forever with a frozen composer. Resolve undefined and surface a
               * toast so the send still proceeds with the readable attachments.
               */
              reader.onerror = () => {
                toast.error(
                  formatChatClientCopy(copy['chatClient.attachment.readFailed'], {
                    name: file.name,
                  }),
                );
                resolve(undefined);
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      const readable = attachments.filter((attachment): attachment is Attachment => attachment !== undefined);

      return readable.length > 0 ? readable : undefined;
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      /*
       * Never silently swallow a send. If a stream is genuinely ACTIVE, stop it
       * and tell the user to resend (recoverable, not a muted loss). If `isLoading`
       * is stuck on a STALLED stream (dropped LB/idle, no delta for the stall
       * window), reset and fall through to actually send the new message.
       */
      const sendDecision = classifySend(isLoading, lastStreamActivityRef.current, Date.now());

      if (sendDecision === 'stop-active') {
        abort();
        toast.info(copy['chatClient.generation.stopped']);

        return;
      }

      if (sendDecision === 'reset-and-send') {
        stop();
        setFakeLoading(false);
        chatStore.setKey('aborted', false);

        // fall through — post the new message instead of losing it to a stuck flag.
      }

      let finalMessageContent = messageContent;

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      /*
       * AGM nudge: a user looping in Economy on the same project (several sends
       * in a row) probably has a task Power would handle better. Suggest it AT
       * MOST ONCE PER PROJECT (localStorage marker), as a dismissible toast —
       * never a blocking dialog, never a model name.
       */
      if (projectId && agentPower?.buildTier !== 'power') {
        try {
          const nudgeKey = `vibecore:agent-mode-nudge:${projectId}`;
          const countKey = `vibecore:agent-mode-economy-sends:${projectId}`;

          if (!window.localStorage.getItem(nudgeKey)) {
            const sends = Number(window.localStorage.getItem(countKey) ?? '0') + 1;
            window.localStorage.setItem(countKey, String(sends));

            if (sends >= 4) {
              window.localStorage.setItem(nudgeKey, new Date().toISOString());
              toast.info(copy['chatClient.generation.powerNudge'], { autoClose: 8000 });
            }
          }
        } catch {
          // storage unavailable — the nudge is best-effort
        }
      }

      runAnimation();

      /*
       * A reopened project hydrates its transcript ASYNCHRONOUSLY (backend fetch
       * → setMessages + setChatStarted, see the hydrateBackendTranscript effect).
       * If the user sends during/just-after hydration while the `chatStarted`
       * flag is transiently still false, the old `!chatStarted` guard routed the
       * send into the homepage starter-template / new-chat branch — which
       * OVERWRITES the live transcript with synthetic messages and finishes via
       * reload() instead of append(). Post-reload that path produced ZERO
       * `POST /api/chat` (deterministic repro), silently losing the edit: the
       * "reopened project won't accept edits" bug. Key the branch off LIVE state
       * (any hydrated message, or any project-IDE session) so a reopened
       * conversation always append()s to `/api/chat`.
       */
      const conversationStarted = chatStarted || messages.length > 0 || projectIdeMode;

      // Fail-loud: one line per submit so the exact branch + state is visible in the console.
      console.info(
        `[send] projectIdeMode=${projectIdeMode} chatStarted=${chatStarted} conversationStarted=${conversationStarted} ` +
          `messages=${messages.length} initial=${initialMessages.length} isLoading=${isLoading} decision=${sendDecision}`,
      );

      if (!conversationStarted) {
        console.info('[send] branch=starter-template/new-chat (reload, no append)');
        setFakeLoading(true);

        /*
         * Clear any stale aborted flag so a Stop pressed DURING the upcoming
         * template-selection LLM calls is observable below. abort() sets it true
         * and clears fakeLoading; we re-check it after each await and bail before
         * kicking off a generation the user already cancelled.
         */
        chatStore.setKey('aborted', false);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning(copy['chatClient.starter.rateLimited']);
              } else {
                toast.warning(copy['chatClient.starter.importFailed']);
              }

              return null;
            });

            if (temResp) {
              /*
               * The user may have pressed Stop while selectStarterTemplate()/
               * getTemplates() were resolving. abort() set `aborted` and released
               * the composer; honor it instead of force-starting a generation.
               */
              if (chatStore.get().aborted) {
                return;
              }

              const { assistantMessage, userMessage } = temResp;
              const userMessageText = finalMessageContent;

              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessage,
                  annotations: ['hidden'],
                },
              ]);

              const reloadOptions =
                uploadedFiles.length > 0
                  ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
                  : undefined;

              reload(reloadOptions);
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        const userMessageText = finalMessageContent;
        const attachments = uploadedFiles.length > 0 ? await filesToAttachments(uploadedFiles) : undefined;

        /*
         * Stop pressed during the (possibly slow) template selection / attachment
         * read above must cancel the generation rather than fire it after the fact.
         */
        if (chatStore.get().aborted) {
          setFakeLoading(false);

          return;
        }

        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: userMessageText,
            parts: createMessageParts(userMessageText, imageDataList),
            experimental_attachments: attachments,
          },
        ]);
        reload(attachments ? { experimental_attachments: attachments } : undefined);
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`, language);
        const messageText = `${userUpdateArtifact}${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        console.info(
          `[send] branch=append (with modified-files artifact) → POST /api/chat, messages=${messages.length}`,
        );
        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = finalMessageContent;

        const attachmentOptions =
          uploadedFiles.length > 0 ? { experimental_attachments: await filesToAttachments(uploadedFiles) } : undefined;

        console.info(`[send] branch=append (plain) → POST /api/chat, messages=${messages.length}`);
        append(
          {
            role: 'user',
            content: messageText,
            parts: createMessageParts(messageText, imageDataList),
          },
          attachmentOptions,
        );
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the input state.
     * @param event - The change event from the textarea.
     */
    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        try {
          setApiKeys(JSON.parse(storedApiKeys));
        } catch {
          // A corrupted cookie must not crash the chat on mount.
          setApiKeys({});
        }
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;

        // Update the input via the same mechanism as handleInputChange
        const syntheticEvent = {
          target: { value: newInput },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
      },
      [input, handleInputChange],
    );

    /*
     * IDE-mode "Regenerate from this prompt". The standalone chat rewinds via a
     * ?rewindTo= URL param consumed by useChatHistory (IndexedDB), which does
     * nothing in the project IDE where the conversation lives in the useChat
     * state and is persisted to project memory. Here we drop the targeted
     * assistant message and everything after it, then reload() to regenerate a
     * fresh response from the preceding user prompt. onFinish persists the
     * regenerated history; we persist the truncation eagerly so a failed/empty
     * regeneration still reflects the rewind.
     */
    const handleRewindToMessage = useCallback(
      (messageId: string) => {
        if (isLoading) {
          return;
        }

        const truncated = computeRewindTruncation(messages, messageId);

        if (!truncated) {
          return;
        }

        setMessages(truncated);
        void persistMessageHistory(truncated);
        void reload();
      },
      [isLoading, messages, setMessages, persistMessageHistory, reload],
    );

    /*
     * Edit a previous USER message and resubmit (Cursor/Replit parity). We reuse
     * the proven flow rather than inventing a new submit path: drop that user
     * message and everything after it, then prefill the composer with its text so
     * the user edits and sends through the normal handler. UserMessage dispatches
     * the event (already metadata-stripped) so no callback threads through the
     * volatile BaseChat.
     */
    useEffect(() => {
      const onEdit = (event: Event) => {
        if (isLoading) {
          return;
        }

        const detail = (event as CustomEvent<{ messageId?: string; text?: string }>).detail;
        const messageId = detail?.messageId;

        if (!messageId) {
          return;
        }

        const index = latestMessagesRef.current.findIndex((message) => message.id === messageId);

        if (index < 0) {
          return;
        }

        const truncated = latestMessagesRef.current.slice(0, index);
        setMessages(truncated);
        void persistMessageHistory(truncated);
        setInput(detail?.text ?? '');

        requestAnimationFrame(() => {
          const textarea = textareaRef.current;

          if (textarea) {
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
          }
        });
      };

      window.addEventListener('vibecore:edit-message', onEdit as EventListener);

      return () => window.removeEventListener('vibecore:edit-message', onEdit as EventListener);
    }, [isLoading, setMessages, persistMessageHistory, setInput]);

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={forceWorkbench || chatStarted}
        projectIdeMode={projectIdeMode}
        projectId={projectId}
        projectUrl={projectUrl}
        initialIdePanels={initialIdePanels}
        isStreaming={isLoading || fakeLoading}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        handleInputChange={(e) => {
          onTextareaChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          return {
            ...message,
            content: parsedMessages[i] || message.content,
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (input) => {
              setInput(input);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        data={chatData}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={append}
        onRewindToMessage={handleRewindToMessage}
        resetChat={() => {
          if (projectIdeMode && projectId) {
            getProjectIdeMemory(projectId)
              .then((memory) => {
                const currentMessages = messages.filter((message) => !message.annotations?.includes('no-store'));

                if (!currentMessages.length) {
                  return;
                }

                const now = new Date().toISOString();
                const firstUserMessage = currentMessages.find((message) => message.role === 'user');

                const conversationId =
                  typeof crypto !== 'undefined' && 'randomUUID' in crypto
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

                void saveProjectIdeMemory(projectId, {
                  chat: {
                    id: `project:${projectId}`,
                    description: description ?? copy['chatClient.project.agent'],
                    messages: [],
                    clearMessages: true,
                    conversations: [
                      ...(memory.chat?.conversations ?? []),
                      {
                        id: conversationId,
                        title: String(firstUserMessage?.content ?? copy['chatClient.project.conversation']).slice(
                          0,
                          96,
                        ),
                        messages: currentMessages,
                        createdAt: now,
                        updatedAt: now,
                      },
                    ].slice(-MAX_PROJECT_ARCHIVED_CONVERSATIONS),
                  },
                });
              })
              .catch((error) => console.error('Failed to archive project conversation', error));
          }

          setMessages([]);
          backendAiConversationIdRef.current = undefined;

          if (projectIdeMode && projectId) {
            const currentMetadata = chatMetadata.get();

            if (currentMetadata?.aiConversationId) {
              const nextMetadata = { ...currentMetadata };
              delete nextMetadata.aiConversationId;
              chatMetadata.set(nextMetadata);
              void saveProjectIdeMemory(projectId, {
                chat: {
                  metadata: nextMetadata,
                },
              });
            }
          }

          pendingPersistRef.current = null;
          persistMessageHistory([]).catch((error) => {
            logger.error('Failed to reset chat history', error);
            toast.error(copy['chatClient.history.resetFailed']);
          });
          setInput('');
          setData(undefined);
        }}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolResult}
        onWebSearchResult={handleWebSearchResult}
      />
    );
  },
);
