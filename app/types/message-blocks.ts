/**
 * Typed message block model used to render assistant and user messages.
 *
 * A `MessageBlock` is the unit of rendering — each top-level block becomes a
 * visual section in the chat (text bubble, artifact card, tool-call panel,
 * attachment pill, etc.). Block-based rendering decouples the chat UI from
 * the underlying string content and from the AI SDK `parts[]` shape, and gives
 * future sprints a stable surface to attach per-block state (collapsed, accepted,
 * rejected, hidden, …).
 */

export type MessageBlockKind =
  | 'text'
  | 'artifact'
  | 'fileAction'
  | 'shellAction'
  | 'supabaseAction'
  | 'startAction'
  | 'buildAction'
  | 'quickActions'
  | 'toolInvocation'
  | 'reasoning'
  | 'source'
  | 'file'
  | 'stepStart'
  | 'attachment';

interface MessageBlockBase {
  /** Stable id used as React key and for per-block UI state lookups. */
  id: string;
}

export interface TextBlock extends MessageBlockBase {
  kind: 'text';
  text: string;
}

export interface FileActionBlock extends MessageBlockBase {
  kind: 'fileAction';
  artifactId: string;
  actionId: string;
  filePath: string;
  content: string;

  /** True while the action is still being streamed (close tag not seen yet). */
  streaming: boolean;
}

export interface ShellActionBlock extends MessageBlockBase {
  kind: 'shellAction';
  artifactId: string;
  actionId: string;
  content: string;
  streaming: boolean;
}

export interface SupabaseActionBlock extends MessageBlockBase {
  kind: 'supabaseAction';
  artifactId: string;
  actionId: string;
  operation: 'migration' | 'query';
  filePath?: string;
  content: string;
  streaming: boolean;
}

export interface StartActionBlock extends MessageBlockBase {
  kind: 'startAction';
  artifactId: string;
  actionId: string;
  content: string;
  streaming: boolean;
}

export interface BuildActionBlock extends MessageBlockBase {
  kind: 'buildAction';
  artifactId: string;
  actionId: string;
  content: string;
  streaming: boolean;
}

export type ActionBlock =
  | FileActionBlock
  | ShellActionBlock
  | SupabaseActionBlock
  | StartActionBlock
  | BuildActionBlock;

export interface ArtifactBlock extends MessageBlockBase {
  kind: 'artifact';
  artifactId: string;
  title: string;
  artifactType?: string;

  /** Actions nested inside the artifact, in source order. */
  children: ActionBlock[];

  /** True once the `</boltArtifact>` close tag has been observed. */
  closed: boolean;
}

export interface QuickActionsBlock extends MessageBlockBase {
  kind: 'quickActions';
  actions: Array<{
    type: string;
    label: string;
    message?: string;
    path?: string;
    href?: string;
  }>;
}

export interface ToolInvocationBlock extends MessageBlockBase {
  kind: 'toolInvocation';
  toolCallId: string;
  toolName: string;
  args?: unknown;
  state: 'partial-call' | 'call' | 'result';
  result?: unknown;
}

export interface ReasoningBlock extends MessageBlockBase {
  kind: 'reasoning';
  text: string;
}

export interface SourceBlock extends MessageBlockBase {
  kind: 'source';
  sourceType: string;
  url?: string;
  title?: string;
  metadata?: Record<string, unknown>;
}

export interface FilePartBlock extends MessageBlockBase {
  kind: 'file';
  mimeType: string;
  data?: string;
  url?: string;
}

export interface StepStartBlock extends MessageBlockBase {
  kind: 'stepStart';
}

export interface AttachmentBlock extends MessageBlockBase {
  kind: 'attachment';
  name?: string;
  contentType?: string;
  url: string;
}

export type MessageBlock =
  | TextBlock
  | ArtifactBlock
  | ActionBlock
  | QuickActionsBlock
  | ToolInvocationBlock
  | ReasoningBlock
  | SourceBlock
  | FilePartBlock
  | StepStartBlock
  | AttachmentBlock;

export function isActionBlock(block: MessageBlock): block is ActionBlock {
  return (
    block.kind === 'fileAction' ||
    block.kind === 'shellAction' ||
    block.kind === 'supabaseAction' ||
    block.kind === 'startAction' ||
    block.kind === 'buildAction'
  );
}

export function isArtifactBlock(block: MessageBlock): block is ArtifactBlock {
  return block.kind === 'artifact';
}

export function isTextBlock(block: MessageBlock): block is TextBlock {
  return block.kind === 'text';
}

/**
 * Walk a block list (including artifact children) and yield every block.
 * Useful for "find me all file actions in this message" style queries.
 */
export function* iterateBlocks(blocks: readonly MessageBlock[]): Generator<MessageBlock> {
  for (const block of blocks) {
    yield block;

    if (isArtifactBlock(block)) {
      for (const child of block.children) {
        yield child;
      }
    }
  }
}

export function collectActionBlocks(blocks: readonly MessageBlock[]): ActionBlock[] {
  const result: ActionBlock[] = [];

  for (const block of iterateBlocks(blocks)) {
    if (isActionBlock(block)) {
      result.push(block);
    }
  }

  return result;
}
