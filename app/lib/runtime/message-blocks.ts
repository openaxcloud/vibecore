/**
 * Convert AI SDK `Message` values into a flat, ordered list of typed
 * `MessageBlock`s ready for rendering.
 *
 * This is the bridge between the AI SDK shape (free-form `content` string +
 * loosely-typed `parts[]`) and the chat UI, which renders one React component
 * per block kind. The converter is a pure, deterministic snapshot transform —
 * it does not maintain its own incremental state, so callers can re-run it on
 * the latest message snapshot during streaming and trust that blocks remain
 * stable for memoization.
 *
 * Supported sources:
 *   - `message.content` parsed via `StreamingMessageParser` for boltArtifact /
 *     boltAction (file / shell / supabase / start / build) blocks.
 *   - `message.parts` for AI SDK tool invocations, reasoning, sources, inline
 *     files and step boundaries.
 *   - `message.experimental_attachments` for user-uploaded attachments.
 */

import type { Message } from 'ai';
import { StreamingMessageParser } from './message-parser';
import type { BoltAction, FileAction, ShellAction, SupabaseAction } from '~/types/actions';
import type {
  ActionBlock,
  ArtifactBlock,
  AttachmentBlock,
  FilePartBlock,
  MessageBlock,
  ReasoningBlock,
  SourceBlock,
  StepStartBlock,
  TextBlock,
  ToolInvocationBlock,
} from '~/types/message-blocks';

/*
 * Null-byte sentinels safely mark artifact insertion points without polluting
 * adjacent text. Valid markdown / HTML emitted by the parser cannot contain
 * null bytes, and artifact ids (`${messageId}-${counter}`) cannot either, so
 * a non-overlapping split on the sentinel is unambiguous.
 */
const NUL = String.fromCharCode(0);
const ARTIFACT_SENTINEL_PREFIX = `${NUL}VC_ART:`;
const ARTIFACT_SENTINEL_SUFFIX = NUL;
const ARTIFACT_SENTINEL_PATTERN = new RegExp(`${NUL}VC_ART:([^${NUL}]+)${NUL}`, 'g');

function blockIdFor(messageId: string, suffix: string) {
  return `${messageId}-${suffix}`;
}

function makeActionBlock(
  messageId: string,
  artifactId: string,
  actionId: string,
  action: BoltAction,
  streaming: boolean,
): ActionBlock | null {
  const id = blockIdFor(messageId, `art-${artifactId}-act-${actionId}`);

  switch (action.type) {
    case 'file':
      return {
        id,
        kind: 'fileAction',
        artifactId,
        actionId,
        filePath: (action as FileAction).filePath,
        content: action.content,
        streaming,
      };
    case 'shell':
      return {
        id,
        kind: 'shellAction',
        artifactId,
        actionId,
        content: (action as ShellAction).content,
        streaming,
      };
    case 'supabase': {
      const supabase = action as SupabaseAction;
      return {
        id,
        kind: 'supabaseAction',
        artifactId,
        actionId,
        operation: supabase.operation,
        filePath: supabase.filePath,
        content: supabase.content,
        streaming,
      };
    }
    case 'start':
      return {
        id,
        kind: 'startAction',
        artifactId,
        actionId,
        content: action.content,
        streaming,
      };
    case 'build':
      return {
        id,
        kind: 'buildAction',
        artifactId,
        actionId,
        content: action.content,
        streaming,
      };
    default:
      return null;
  }
}

/**
 * Parse a single text payload (e.g. one AI SDK text part, or the legacy
 * `message.content` string) into the text + artifact blocks it contains.
 *
 * Plain text segments — including any HTML emitted for quick-action buttons —
 * are returned as `TextBlock`s in source order. Each `<boltArtifact>` is
 * returned as an `ArtifactBlock` with its file/shell/supabase actions nested
 * as children.
 */
export function parseTextPayloadToBlocks(messageId: string, text: string): MessageBlock[] {
  if (!text) {
    return [];
  }

  /*
   * Artifact metadata + nested action blocks keyed by artifactId, populated
   * synchronously by the streaming parser's callbacks below.
   */
  const artifactState = new Map<
    string,
    {
      title: string;
      artifactType?: string;
      children: ActionBlock[];
      openActions: Map<string, ActionBlock>;
      closed: boolean;
    }
  >();

  let activeArtifactId: string | null = null;

  const parser = new StreamingMessageParser({
    artifactElement: ({ artifactId }) => `${ARTIFACT_SENTINEL_PREFIX}${artifactId}${ARTIFACT_SENTINEL_SUFFIX}`,
    callbacks: {
      onArtifactOpen: ({ artifactId, title, type }) => {
        if (!artifactId) {
          return;
        }

        activeArtifactId = artifactId;
        artifactState.set(artifactId, {
          title: title ?? '',
          artifactType: type,
          children: [],
          openActions: new Map(),
          closed: false,
        });
      },
      onArtifactClose: ({ artifactId }) => {
        const state = artifactId ? artifactState.get(artifactId) : undefined;

        if (state) {
          state.closed = true;
        }

        if (activeArtifactId === artifactId) {
          activeArtifactId = null;
        }
      },
      onActionOpen: ({ artifactId, actionId, action }) => {
        const state = artifactState.get(artifactId);

        if (!state) {
          return;
        }

        const block = makeActionBlock(messageId, artifactId, actionId, action, true);

        if (!block) {
          return;
        }

        state.children.push(block);
        state.openActions.set(actionId, block);
      },
      onActionStream: ({ artifactId, actionId, action }) => {
        const state = artifactState.get(artifactId);
        const existing = state?.openActions.get(actionId);

        if (!state || !existing) {
          return;
        }

        const updated = makeActionBlock(messageId, artifactId, actionId, action, true);

        if (!updated) {
          return;
        }

        const idx = state.children.indexOf(existing);

        if (idx >= 0) {
          state.children[idx] = updated;
        }

        state.openActions.set(actionId, updated);
      },
      onActionClose: ({ artifactId, actionId, action }) => {
        const state = artifactState.get(artifactId);

        if (!state) {
          return;
        }

        const updated = makeActionBlock(messageId, artifactId, actionId, action, false);

        if (!updated) {
          return;
        }

        const existing = state.openActions.get(actionId);

        if (existing) {
          const idx = state.children.indexOf(existing);

          if (idx >= 0) {
            state.children[idx] = updated;
          }
        } else {
          state.children.push(updated);
        }

        state.openActions.delete(actionId);
      },
    },
  });

  /*
   * A malformed action tag (e.g. a Supabase action with a missing/invalid
   * `operation` or a migration without a `filePath`) makes the parser throw.
   * In a rendering context that would crash the whole chat panel — and during
   * streaming it re-throws on every keystroke. Fall back to showing the raw
   * text rather than blowing up the message list.
   */
  let output: string;

  try {
    output = parser.parse(messageId, text);
  } catch {
    return [{ id: blockIdFor(messageId, 'text-0'), kind: 'text', text }];
  }

  /*
   * Interleave text + artifact blocks by splitting the parser output on artifact
   * sentinels in source order.
   */
  const blocks: MessageBlock[] = [];
  ARTIFACT_SENTINEL_PATTERN.lastIndex = 0;

  let lastIndex = 0;
  let textCounter = 0;
  let match: RegExpExecArray | null;

  while ((match = ARTIFACT_SENTINEL_PATTERN.exec(output)) !== null) {
    const before = output.slice(lastIndex, match.index);

    if (before.length > 0) {
      const textBlock: TextBlock = {
        id: blockIdFor(messageId, `text-${textCounter++}`),
        kind: 'text',
        text: before,
      };
      blocks.push(textBlock);
    }

    const artifactId = match[1];
    const state = artifactState.get(artifactId);

    if (state) {
      const artifactBlock: ArtifactBlock = {
        id: blockIdFor(messageId, `art-${artifactId}`),
        kind: 'artifact',
        artifactId,
        title: state.title,
        artifactType: state.artifactType,
        children: state.children,
        closed: state.closed,
      };
      blocks.push(artifactBlock);
    }

    lastIndex = match.index + match[0].length;
  }

  const trailing = output.slice(lastIndex);

  if (trailing.length > 0) {
    blocks.push({
      id: blockIdFor(messageId, `text-${textCounter++}`),
      kind: 'text',
      text: trailing,
    });
  }

  return blocks;
}

type AiSdkPart = NonNullable<Message['parts']>[number];
type AttachmentLike = { name?: string; contentType?: string; url: string };
type MessageWithAttachments = Message & { experimental_attachments?: AttachmentLike[] };

function partToBlocks(messageId: string, part: AiSdkPart, idx: number): MessageBlock[] {
  switch (part.type) {
    case 'text':
      return parseTextPayloadToBlocks(`${messageId}-p${idx}`, part.text);
    case 'reasoning': {
      const block: ReasoningBlock = {
        id: blockIdFor(messageId, `reasoning-${idx}`),
        kind: 'reasoning',
        text: part.reasoning ?? '',
      };
      return [block];
    }
    case 'tool-invocation': {
      const invocation = part.toolInvocation;

      const block: ToolInvocationBlock = {
        id: blockIdFor(messageId, `tool-${invocation.toolCallId}`),
        kind: 'toolInvocation',
        toolCallId: invocation.toolCallId,
        toolName: invocation.toolName,
        args: 'args' in invocation ? invocation.args : undefined,
        state: invocation.state,
        result: invocation.state === 'result' ? invocation.result : undefined,
      };

      return [block];
    }
    case 'source': {
      const source = part.source as { sourceType?: string; url?: string; title?: string } & Record<string, unknown>;

      const block: SourceBlock = {
        id: blockIdFor(messageId, `source-${idx}`),
        kind: 'source',
        sourceType: source.sourceType ?? 'unknown',
        url: source.url,
        title: source.title,
        metadata: source,
      };

      return [block];
    }
    case 'file': {
      const block: FilePartBlock = {
        id: blockIdFor(messageId, `file-${idx}`),
        kind: 'file',
        mimeType: part.mimeType ?? 'application/octet-stream',
        data: (part as { data?: string }).data,
      };
      return [block];
    }
    case 'step-start': {
      const block: StepStartBlock = {
        id: blockIdFor(messageId, `step-${idx}`),
        kind: 'stepStart',
      };
      return [block];
    }
    default:
      return [];
  }
}

/**
 * Convert an AI SDK `Message` into an ordered list of typed `MessageBlock`s.
 *
 * Resolution order:
 *   1. If `message.parts` is present and non-empty, each part is converted in
 *      order. Text parts get further parsed into text + artifact blocks via
 *      {@link parseTextPayloadToBlocks}.
 *   2. Otherwise the legacy `message.content` string is parsed as a single
 *      text payload.
 *   3. `experimental_attachments` are appended as `AttachmentBlock`s at the end
 *      of the message.
 */
export function messageToBlocks(message: Message): MessageBlock[] {
  const messageId = message.id ?? `msg-${message.role}`;
  const blocks: MessageBlock[] = [];

  if (Array.isArray(message.parts) && message.parts.length > 0) {
    message.parts.forEach((part, idx) => {
      blocks.push(...partToBlocks(messageId, part, idx));
    });
  } else if (typeof message.content === 'string' && message.content.length > 0) {
    blocks.push(...parseTextPayloadToBlocks(messageId, message.content));
  }

  const attachments = (message as MessageWithAttachments).experimental_attachments;

  if (Array.isArray(attachments)) {
    attachments.forEach((attachment, idx) => {
      if (!attachment?.url) {
        return;
      }

      const block: AttachmentBlock = {
        id: blockIdFor(messageId, `attachment-${idx}`),
        kind: 'attachment',
        name: attachment.name,
        contentType: attachment.contentType,
        url: attachment.url,
      };
      blocks.push(block);
    });
  }

  return blocks;
}
