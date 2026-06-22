/**
 * Plan-first checklist data model + markdown parser (Sprint 5).
 *
 * The agent emits an actionable plan as a markdown task list (`- [ ] todo`,
 * `- [x] done`, `- [-] in progress`) before any code action; the
 * `<PlanChecklist>` component renders that list with live status badges
 * and progress bar, updating as the assistant reports back.
 *
 * This module owns the data model and parser; rendering lives in
 * `app/components/chat/PlanChecklist.tsx`.
 */

export type PlanItemStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface PlanItem {
  /** Stable id used as React key + for status updates. */
  id: string;

  /** Human-readable description; the part after the `[ ]` checkbox. */
  description: string;

  /** Lifecycle state derived from the checkbox marker. */
  status: PlanItemStatus;

  /**
   * Optional sub-text that the agent attaches when reporting completion
   * (e.g. "Generated 3 files"). Rendered under the description.
   */
  result?: string;
}

export interface PlanChecklist {
  /** Optional heading line above the list. */
  title?: string;

  /** Ordered items in source order. */
  items: PlanItem[];
}

const CHECKBOX_PATTERN = /^[-*+]\s*\[(?<marker>[\sxX\-~?!/])\]\s+(?<description>.+)$/;
const TITLE_PATTERN = /^(?:#{1,6}\s+)?(?<title>.+?)\s*$/;

/**
 * Parse a markdown-flavoured task list into a structured plan.
 *
 * Accepted markers (case-insensitive):
 *   `[ ]` → `pending`
 *   `[-]` `[/]` → `in_progress`
 *   `[x]` `[~]` → `completed`
 *   `[!]` `[?]` → `failed`
 *
 * Anything before the first `- [ ]` line is treated as the optional
 * title (joined with spaces). Lines after the first list item that
 * don't match the pattern are appended to the previous item's
 * `result` field, so the agent can attach short status notes.
 */
export function parsePlanChecklist(source: string): PlanChecklist | undefined {
  if (!source.trim()) {
    return undefined;
  }

  const lines = source.split(/\r?\n/);
  const items: PlanItem[] = [];

  let title: string | undefined;
  let cursor: PlanItem | undefined;

  const titleLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      cursor = undefined;
      continue;
    }

    const checkbox = CHECKBOX_PATTERN.exec(line);

    if (checkbox && checkbox.groups) {
      const marker = checkbox.groups.marker;
      const description = checkbox.groups.description.trim();
      const status = markerToStatus(marker);

      const item: PlanItem = {
        id: `plan-item-${items.length}`,
        description,
        status,
      };
      items.push(item);
      cursor = item;
      continue;
    }

    if (items.length === 0) {
      const titleMatch = TITLE_PATTERN.exec(line);

      if (titleMatch?.groups?.title) {
        titleLines.push(titleMatch.groups.title);
      }

      continue;
    }

    if (cursor) {
      const trimmed = line.replace(/^[\s>]+/, '');

      if (trimmed) {
        cursor.result = cursor.result ? `${cursor.result} ${trimmed}` : trimmed;
      }
    }
  }

  if (titleLines.length > 0) {
    title = titleLines.join(' ');
  }

  if (items.length === 0) {
    return undefined;
  }

  return title ? { title, items } : { items };
}

function markerToStatus(marker: string): PlanItemStatus {
  const normalized = marker.trim().toLowerCase();

  switch (normalized) {
    case '':
      return 'pending';
    case 'x':
    case '~':
      return 'completed';
    case '-':
    case '/':
      return 'in_progress';
    case '!':
    case '?':
      return 'failed';
    default:
      return 'pending';
  }
}

export interface PlanProgress {
  completed: number;
  failed: number;
  inProgress: number;
  pending: number;
  total: number;

  /** Ratio in [0, 1] of completed items vs total. */
  completionRatio: number;
}

/**
 * Locate the contiguous plan block in a markdown text + return it plus the
 * rest of the text with that block stripped. Used by the agent-message
 * renderer so the structured checklist component and the Markdown body
 * don't both render the same task list. Returns undefined when no plan
 * is present.
 *
 * The block is the maximal run of consecutive lines that are either:
 *   - a checkbox bullet (`- [ ] …`, `- [x] …`, etc.)
 *   - a blank line nested inside the run
 *   - an indented follow-up note attached to the previous item
 *
 * Optional title: a single non-empty line directly before the run (with
 * a blank line or start-of-text gap allowed) is included.
 */
export interface ExtractedPlan {
  plan: PlanChecklist;
  remainingText: string;
}

const CHECKBOX_LINE = /^[-*+]\s*\[[\sxX\-~?!/]\]\s+.+$/;

export function extractAndStripPlanChecklist(source: string): ExtractedPlan | undefined {
  if (!source.trim()) {
    return undefined;
  }

  const lines = source.split(/\r?\n/);

  let firstCheckboxIdx = -1;
  let lastCheckboxIdx = -1;

  for (let i = 0; i < lines.length; i += 1) {
    if (CHECKBOX_LINE.test(lines[i].trim())) {
      if (firstCheckboxIdx === -1) {
        firstCheckboxIdx = i;
      }

      lastCheckboxIdx = i;
    }
  }

  if (firstCheckboxIdx === -1) {
    return undefined;
  }

  /*
   * Expand backwards to absorb an optional title line. Scan back skipping
   * blank lines; the first non-blank line that is NOT a checkbox is the
   * title candidate. Take it only if it looks like a heading or short
   * narrative sentence (we leave heuristics simple — anything up to ~80
   * chars qualifies).
   */
  let titleIdx = -1;
  let cursor = firstCheckboxIdx - 1;

  while (cursor >= 0 && lines[cursor].trim() === '') {
    cursor -= 1;
  }

  if (cursor >= 0 && !CHECKBOX_LINE.test(lines[cursor].trim())) {
    const candidate = lines[cursor].trim();

    if (candidate.length > 0 && candidate.length <= 200) {
      titleIdx = cursor;
    }
  }

  /*
   * Expand forward to absorb indented follow-up notes attached to the
   * last item. Stop on the first non-indented non-blank line that isn't
   * a checkbox.
   *
   * A blank line separates the plan block from any following prose, so an
   * indented line is only treated as a follow-up note when no blank line
   * has intervened since the last absorbed checkbox/note. Otherwise an
   * indented code block, blockquote, or paragraph written after the plan
   * would be swallowed into the plan region and stripped from the body.
   */
  let endIdx = lastCheckboxIdx;
  let sawBlankGap = false;

  for (let i = lastCheckboxIdx + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (trimmed === '') {
      sawBlankGap = true;
      continue;
    }

    if (CHECKBOX_LINE.test(trimmed)) {
      endIdx = i;
      sawBlankGap = false;
      continue;
    }

    if (/^\s/.test(raw) && !sawBlankGap) {
      endIdx = i;
      continue;
    }

    break;
  }

  const planStart = titleIdx >= 0 ? titleIdx : firstCheckboxIdx;
  const planLines = lines.slice(planStart, endIdx + 1).join('\n');
  const plan = parsePlanChecklist(planLines);

  if (!plan) {
    return undefined;
  }

  const before = lines.slice(0, planStart).join('\n');
  const after = lines.slice(endIdx + 1).join('\n');

  const remainingText = [before, after]
    .map((segment) => segment.replace(/^\n+|\n+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('\n\n');

  return { plan, remainingText };
}

export function summarizePlanProgress(plan: PlanChecklist): PlanProgress {
  let completed = 0;
  let failed = 0;
  let inProgress = 0;
  let pending = 0;

  for (const item of plan.items) {
    switch (item.status) {
      case 'completed':
        completed += 1;
        break;
      case 'failed':
        failed += 1;
        break;
      case 'in_progress':
        inProgress += 1;
        break;
      case 'pending':
        pending += 1;
        break;
    }
  }

  const total = plan.items.length;

  return {
    completed,
    failed,
    inProgress,
    pending,
    total,
    completionRatio: total === 0 ? 0 : completed / total,
  };
}

/**
 * Apply a status update to a plan, returning a new plan object. Items
 * are matched by `id`; unmatched updates are ignored so stale ids from
 * a previous snapshot don't corrupt the state.
 */
export function applyPlanStatusUpdate(
  plan: PlanChecklist,
  update: { id: string; status: PlanItemStatus; result?: string },
): PlanChecklist {
  let changed = false;

  const nextItems = plan.items.map((item) => {
    if (item.id !== update.id) {
      return item;
    }

    if (item.status === update.status && item.result === update.result) {
      return item;
    }

    changed = true;

    return { ...item, status: update.status, ...(update.result !== undefined ? { result: update.result } : {}) };
  });

  if (!changed) {
    return plan;
  }

  return { ...plan, items: nextItems };
}
