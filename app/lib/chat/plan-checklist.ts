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
