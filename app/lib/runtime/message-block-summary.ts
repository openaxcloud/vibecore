/**
 * Pure summary helper that flattens a `MessageBlock[]` snapshot into the
 * structured shape the assistant message renderer needs.
 *
 * Sprint 2 wires the chat panel to render one component per block kind:
 * narration as Markdown, artifacts as cards, file actions as inline diffs,
 * tool invocations as collapsible panels, etc. Each renderer wants a
 * pre-grouped slice — narration in source order, file actions flattened
 * across all artifacts (so "Accept all" / "12 files applied" toasts can
 * count them without re-walking the tree), and so on.
 *
 * Computing the summary is cheap (a single walk) but it keeps the
 * renderer's branches obvious and the tests focused on data shape rather
 * than React details.
 */

import {
  type ArtifactBlock,
  type AttachmentBlock,
  type FileActionBlock,
  type FilePartBlock,
  type MessageBlock,
  type ReasoningBlock,
  type ShellActionBlock,
  type SourceBlock,
  type StepStartBlock,
  type SupabaseActionBlock,
  type StartActionBlock,
  type BuildActionBlock,
  type QuickActionsBlock,
  type TextBlock,
  type ToolInvocationBlock,
  iterateBlocks,
} from '~/types/message-blocks';

/**
 * A single segment of the assistant message's prose / artifact narrative,
 * preserving the source order so the renderer can intersperse text and
 * artifact cards as they appeared in the streamed payload.
 */
export type NarrationSegment =
  | { kind: 'text'; block: TextBlock }
  | { kind: 'artifact'; block: ArtifactBlock }
  | { kind: 'quickActions'; block: QuickActionsBlock };

export interface AssistantMessageSummary {
  /**
   * Ordered prose + artifact + quickActions sequence — what shows up in
   * the main message body. Other sidebar / footer items live in their
   * own arrays below.
   */
  narration: NarrationSegment[];

  /**
   * All artifact cards in source order. Same references as the ones in
   * `narration`, surfaced as a flat list for "scroll to artifact" /
   * agent-panel index use cases.
   */
  artifacts: ArtifactBlock[];

  /**
   * File-write actions flattened across every artifact. Sprint 2's
   * inline-diff renderer + the existing "N files applied" toast both
   * need this without re-walking the tree.
   */
  fileActions: FileActionBlock[];

  /** Shell-exec actions flattened across every artifact. */
  shellActions: ShellActionBlock[];

  /** Supabase migration / query actions flattened across every artifact. */
  supabaseActions: SupabaseActionBlock[];

  /** `<boltAction type="start">` blocks, flattened across every artifact. */
  startActions: StartActionBlock[];

  /** `<boltAction type="build">` blocks, flattened across every artifact. */
  buildActions: BuildActionBlock[];

  /**
   * AI SDK tool-invocation parts (in-progress, partial, result), in
   * source order. Rendered by the existing ToolInvocations component.
   */
  toolInvocations: ToolInvocationBlock[];

  /** Reasoning parts surfaced by the AI SDK, in source order. */
  reasoning: ReasoningBlock[];

  /** Web / citation sources attached to the message, in source order. */
  sources: SourceBlock[];

  /** Inline file parts (AI SDK's `file` part type), in source order. */
  inlineFiles: FilePartBlock[];

  /** Step-start markers — used to render multi-step run separators. */
  stepStarts: StepStartBlock[];

  /** User-uploaded attachments rendered at the end of the message. */
  attachments: AttachmentBlock[];
}

const EMPTY_SUMMARY: Readonly<AssistantMessageSummary> = Object.freeze({
  narration: [] as NarrationSegment[],
  artifacts: [] as ArtifactBlock[],
  fileActions: [] as FileActionBlock[],
  shellActions: [] as ShellActionBlock[],
  supabaseActions: [] as SupabaseActionBlock[],
  startActions: [] as StartActionBlock[],
  buildActions: [] as BuildActionBlock[],
  toolInvocations: [] as ToolInvocationBlock[],
  reasoning: [] as ReasoningBlock[],
  sources: [] as SourceBlock[],
  inlineFiles: [] as FilePartBlock[],
  stepStarts: [] as StepStartBlock[],
  attachments: [] as AttachmentBlock[],
});

export function summarizeAssistantMessage(blocks: readonly MessageBlock[] | undefined): AssistantMessageSummary {
  if (!blocks || blocks.length === 0) {
    return EMPTY_SUMMARY;
  }

  const narration: NarrationSegment[] = [];
  const artifacts: ArtifactBlock[] = [];
  const fileActions: FileActionBlock[] = [];
  const shellActions: ShellActionBlock[] = [];
  const supabaseActions: SupabaseActionBlock[] = [];
  const startActions: StartActionBlock[] = [];
  const buildActions: BuildActionBlock[] = [];
  const toolInvocations: ToolInvocationBlock[] = [];
  const reasoning: ReasoningBlock[] = [];
  const sources: SourceBlock[] = [];
  const inlineFiles: FilePartBlock[] = [];
  const stepStarts: StepStartBlock[] = [];
  const attachments: AttachmentBlock[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case 'text':
        narration.push({ kind: 'text', block });
        break;
      case 'artifact':
        narration.push({ kind: 'artifact', block });
        artifacts.push(block);
        break;
      case 'quickActions':
        narration.push({ kind: 'quickActions', block });
        break;
      case 'toolInvocation':
        toolInvocations.push(block);
        break;
      case 'reasoning':
        reasoning.push(block);
        break;
      case 'source':
        sources.push(block);
        break;
      case 'file':
        inlineFiles.push(block);
        break;
      case 'stepStart':
        stepStarts.push(block);
        break;
      case 'attachment':
        attachments.push(block);
        break;

      /*
       * Action blocks at the top level (no enclosing artifact) are rare
       * but handled below alongside their nested-in-artifact counterparts.
       */
      case 'fileAction':
      case 'shellAction':
      case 'supabaseAction':
      case 'startAction':
      case 'buildAction':
        // fall through to the iterateBlocks-driven pass below
        break;
    }
  }

  /*
   * Second pass: walk every block (including the children inside artifact
   * containers) to flatten action blocks. iterateBlocks descends into
   * ArtifactBlock.children so we collect actions in their source order,
   * which is what "Accept all" + the inline-diff renderer expect.
   */
  for (const block of iterateBlocks(blocks)) {
    switch (block.kind) {
      case 'fileAction':
        fileActions.push(block);
        break;
      case 'shellAction':
        shellActions.push(block);
        break;
      case 'supabaseAction':
        supabaseActions.push(block);
        break;
      case 'startAction':
        startActions.push(block);
        break;
      case 'buildAction':
        buildActions.push(block);
        break;
      default:
        break;
    }
  }

  return {
    narration,
    artifacts,
    fileActions,
    shellActions,
    supabaseActions,
    startActions,
    buildActions,
    toolInvocations,
    reasoning,
    sources,
    inlineFiles,
    stepStarts,
    attachments,
  };
}
