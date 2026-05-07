import type { Messages } from './stream-text';
import { apiRequest } from '~/lib/enterprise-api.server';
import type { ContextAnnotation } from '~/types/context';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('agent-memory');

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

export function latestUserText(messages: Messages) {
  return messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .filter(Boolean)
    .slice(-1)[0];
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
    logger.warn('Agent memory preference lookup skipped', error);
    return true;
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
