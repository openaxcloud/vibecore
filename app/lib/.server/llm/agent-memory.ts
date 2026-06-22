import type { Messages } from './stream-text';
import { apiRequest } from '~/lib/enterprise-api.server';
import type { ContextAnnotation } from '~/types/context';
import { MODEL_REGEX, PROVIDER_REGEX } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('agent-memory');

/**
 * Strip the `[Model: x]` / `[Provider: y]` composer prefixes that the client
 * prepends to raw user messages. The agent-memory callers pass the unprocessed
 * `processedMessages` (stream-text only cleans its own local copy), so without
 * this the boilerplate would pollute persisted memory content/summary and the
 * embedding/retrieval query text.
 */
export function stripComposerTags(text: string): string {
  return text.replace(MODEL_REGEX, '').replace(PROVIDER_REGEX, '');
}

export interface AgentMemoryContextPayload {
  context: string;
  memories: Array<{
    id: string;
    summary: string;
    scope: string;
    memoryType?: string;
    tags?: string[];
    accessCount?: number;
    score?: number;
  }>;
}

export function latestUserText(messages: Messages): string | undefined {
  const latest = messages.filter((message) => message.role === 'user').slice(-1)[0];

  if (!latest) {
    return undefined;
  }

  /*
   * A Message's `content` can be a string OR an array of content parts (AI SDK
   * type). Returning the array verbatim sent `query: [{type:'text',...}]` to the
   * agent-memory API (which expects a string), breaking retrieval. Extract the
   * text parts and join them.
   */
  const { content } = latest;

  if (typeof content === 'string') {
    return stripComposerTags(content).trim() || undefined;
  }

  if (Array.isArray(content)) {
    const text = stripComposerTags(
      (content as Array<{ type?: string; text?: string }>)
        .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
        .map((part) => part.text)
        .join('\n'),
    ).trim();

    return text || undefined;
  }

  return undefined;
}

export function agentMemoryAnnotation(memories: AgentMemoryContextPayload['memories']): ContextAnnotation {
  return {
    type: 'agentMemory',
    memories: memories.map((memory) => ({
      id: memory.id,
      scope: memory.scope,
      memoryType: memory.memoryType,
      tags: memory.tags,
      accessCount: memory.accessCount,
      summary: memory.summary,
      score: memory.score,
    })),
  };
}

export async function isAgentMemoryEnabled(request: Request, input: { projectId?: string }) {
  try {
    const query = input.projectId ? `?projectId=${encodeURIComponent(input.projectId)}` : '';

    const payload = await apiRequest<{ preference?: { enabled?: boolean } }>(
      request,
      `/agent-memory/preferences${query}`,
    );

    return payload.preference?.enabled !== false;
  } catch (error) {
    /*
     * Fail CLOSED: this gates a user privacy opt-out, so if the preference can't
     * be read we must not assume memory is enabled (that would persist/retrieve
     * memories against a user who may have disabled them). Skip memory for this
     * request instead.
     */
    logger.warn('Agent memory preference lookup failed; treating memory as disabled', error);
    return false;
  }
}

export async function retrieveMemoryForAgentContext(
  request: Request,
  input: { messages: Messages; projectId?: string },
) {
  const query = latestUserText(input.messages);

  if (!query || !(await isAgentMemoryEnabled(request, { projectId: input.projectId }))) {
    return undefined;
  }

  try {
    const payload = await apiRequest<AgentMemoryContextPayload>(request, '/agent-memory/context', {
      method: 'POST',
      body: JSON.stringify({
        query,
        projectId: input.projectId,
        scopes: input.projectId ? ['project', 'organization', 'user', 'session'] : ['user', 'session'],
        limit: 8,
      }),
    });

    return payload.context ? payload : undefined;
  } catch (error) {
    logger.warn('Agent memory retrieval skipped', error);
    return undefined;
  }
}

export async function persistAgentMemoryCandidate(
  request: Request,
  input: { messages: Messages; assistantText: string; projectId?: string },
) {
  const userText = latestUserText(input.messages);

  if (!userText || !(await isAgentMemoryEnabled(request, { projectId: input.projectId }))) {
    return;
  }

  try {
    await apiRequest(request, '/agent-memory', {
      method: 'POST',
      body: JSON.stringify({
        scope: input.projectId ? 'project' : 'user',
        projectId: input.projectId,
        content: userText,
        summary: userText,
        memoryType: input.projectId ? 'procedural' : 'semantic',
        tags: input.projectId ? ['project'] : ['user'],
        source: 'chat',
        metadata: {
          assistantExcerpt: input.assistantText.slice(0, 800),
          capturedAt: new Date().toISOString(),
        },
      }),
    });
  } catch (error) {
    logger.warn('Agent memory write skipped', error);
  }
}
