import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatGitMergeEditorConflicts,
  formatGitMergeEditorCopy,
  getGitMergeEditorCopy,
} from '~/lib/i18n/catalogs/git-merge-editor';
import { classNames } from '~/utils/classNames';

/*
 * Lightweight per-hunk 3-way merge resolver (Replit-parity #8). Parses a working
 * -tree file that still carries Git conflict markers into text + conflict segments,
 * lets the user accept current/incoming/both per hunk (or hand-edit the raw text),
 * then emits the marker-free resolved content for `mark-resolved` (write + git add).
 * Not a full Monaco merge editor — a focused, dependency-free resolver.
 */
type Choice = 'ours' | 'theirs' | 'both' | undefined;

type Segment = { type: 'text'; text: string } | { type: 'conflict'; ours: string; theirs: string; base?: string };

function parseConflicts(content: string): Segment[] {
  const lines = content.split('\n');
  const segments: Segment[] = [];

  let text: string[] = [];
  let mode: 'normal' | 'ours' | 'base' | 'theirs' = 'normal';
  let ours: string[] = [];
  let base: string[] = [];
  let theirs: string[] = [];

  const flushText = () => {
    if (text.length) {
      segments.push({ type: 'text', text: text.join('\n') });
      text = [];
    }
  };

  for (const line of lines) {
    if (mode === 'normal' && line.startsWith('<<<<<<<')) {
      flushText();
      mode = 'ours';
      ours = [];
      base = [];
      theirs = [];
      continue;
    }

    if (mode === 'ours' && line.startsWith('|||||||')) {
      mode = 'base';
      continue;
    }

    if ((mode === 'ours' || mode === 'base') && line.startsWith('=======')) {
      mode = 'theirs';
      continue;
    }

    if (mode === 'theirs' && line.startsWith('>>>>>>>')) {
      segments.push({ type: 'conflict', ours: ours.join('\n'), theirs: theirs.join('\n'), base: base.join('\n') });
      mode = 'normal';
      continue;
    }

    if (mode === 'ours') {
      ours.push(line);
    } else if (mode === 'base') {
      base.push(line);
    } else if (mode === 'theirs') {
      theirs.push(line);
    } else {
      text.push(line);
    }
  }

  flushText();

  return segments;
}

function resolveSide(segment: Extract<Segment, { type: 'conflict' }>, choice: Choice): string {
  if (choice === 'ours') {
    return segment.ours;
  }

  if (choice === 'theirs') {
    return segment.theirs;
  }

  if (choice === 'both') {
    return [segment.ours, segment.theirs].filter((side) => side.length).join('\n');
  }

  return '';
}

/*
 * Decide what to seed the raw textarea with when the user toggles into "Edit raw".
 *
 * If every conflict already has a chosen side, `composed` is a faithful, marker-free
 * rendering of the resolution and is the right thing to hand-edit. But if ANY conflict
 * is still unresolved, `composed` has silently dropped those conflict blocks entirely
 * (resolveSide() returns '' and the empty-conflict filter removes them) — seeding from
 * it would make the conflicting code vanish. In that case seed from the original
 * `content` so the user edits the real conflicting text with markers intact.
 */
export function seedRawText(content: string, composed: string, allChosen: boolean): string {
  return allChosen ? composed : content;
}

/*
 * Whether `composed` still carries unresolved Git conflict markers.
 *
 * A blanket per-line regex (e.g. /^(<{7}|\|{7}|={7}|>{7})/m) gives false positives:
 * legitimate source content can begin with seven-plus of these characters — a
 * `=======` markdown/RST divider, a `// =========` section banner, `>>>>>>>` arrow
 * art, etc. — and would wrongly block "Mark resolved" forever. Instead we re-parse the
 * composed text with the same conflict grammar used to build it; a marker only counts
 * if parseConflicts() reconstructs an actual conflict segment (paired <<<<<<< / =======
 * / >>>>>>> block). Legitimate separator lines parse as plain text and are ignored.
 */
export function hasUnresolvedConflictMarkers(composed: string): boolean {
  return parseConflicts(composed).some((segment) => segment.type === 'conflict');
}

export function GitMergeEditor({
  filePath,
  content,
  busy,
  onResolve,
  onCancel,
}: {
  filePath: string;
  content: string;
  busy?: boolean;
  onResolve: (resolved: string) => void;
  onCancel: () => void;
}) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitMergeEditorCopy(language);
  const segments = useMemo(() => parseConflicts(content), [content]);

  const conflictIndexes = useMemo(
    () => segments.map((segment, index) => (segment.type === 'conflict' ? index : -1)).filter((index) => index >= 0),
    [segments],
  );

  const [choices, setChoices] = useState<Record<number, Choice>>({});
  const [rawMode, setRawMode] = useState(false);
  const [raw, setRaw] = useState(content);

  /*
   * Whether the raw textarea has ever been seeded. The raw buffer must be seeded once,
   * on the FIRST entry into raw mode, from the current resolution. After that the buffer
   * is owned by the user: toggling Hunk view -> Edit raw again must NOT reseed (which
   * would clobber hand-typed raw edits — and, with no per-conflict choices made, would
   * even revert to the original conflict-marked `content`).
   */
  const [rawSeeded, setRawSeeded] = useState(false);

  const allChosen = conflictIndexes.every((index) => choices[index]);
  const chosenCount = conflictIndexes.filter((index) => choices[index]).length;

  const composed = useMemo(() => {
    if (rawMode) {
      return raw;
    }

    return (
      segments
        .map((segment, index) => ({
          part: segment.type === 'text' ? segment.text : resolveSide(segment, choices[index]),
          isConflict: segment.type === 'conflict',
        }))
        /*
         * Drop a CONFLICT that resolved to empty (e.g. "accept current" where the
         * current side was empty) so joining with '\n' doesn't inject a spurious
         * blank line where the conflict block used to be. Genuinely-empty TEXT
         * segments (real blank lines in the file) are preserved.
         */
        .filter((entry) => !(entry.isConflict && entry.part.length === 0))
        .map((entry) => entry.part)
        .join('\n')
    );
  }, [segments, choices, rawMode, raw]);

  /*
   * Only block resolve when an ACTUAL conflict block remains (paired markers that
   * parseConflicts reconstructs), not whenever a content line happens to start with
   * seven of <, |, =, or > — those are legitimate (markdown dividers, banners, arrow art).
   */
  const stillHasMarkers = hasUnresolvedConflictMarkers(composed);

  return (
    <div
      className="rounded-md border border-amber-500/40 bg-bolt-elements-background-depth-1 p-3"
      data-testid="git-merge-editor"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-semibold text-bolt-elements-textPrimary">
          <span className="i-ph:git-merge text-base text-amber-500" aria-hidden />
          <code className="truncate text-xs text-bolt-elements-textSecondary">{filePath}</code>
          <span className="shrink-0 text-xs text-bolt-elements-textSecondary">
            {formatGitMergeEditorConflicts(conflictIndexes.length, language)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md border border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3"
            onClick={() => {
              /*
               * Seed the raw textarea exactly ONCE, on the first entry into raw mode:
               * from `composed` when every conflict has a chosen side, otherwise from the
               * original `content` so unresolved conflict blocks (which `composed` drops)
               * are not silently stripped. After the first seed the buffer belongs to the
               * user — re-entering raw via Hunk view must not reseed and clobber edits.
               */
              if (!rawMode && !rawSeeded) {
                setRaw(seedRawText(content, composed, allChosen));
                setRawSeeded(true);
              }

              setRawMode((value) => !value);
            }}
          >
            {rawMode ? copy['gitMergeEditor.hunkView'] : copy['gitMergeEditor.editRaw']}
          </button>
          <button
            type="button"
            aria-label={copy['gitMergeEditor.close']}
            className="i-ph:x inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-base text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary"
            onClick={onCancel}
          />
        </div>
      </div>

      {rawMode ? (
        <textarea
          aria-label={copy['gitMergeEditor.raw.aria']}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          spellCheck={false}
          className="h-64 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 font-mono text-xs text-bolt-elements-textPrimary outline-none focus:border-bolt-elements-focus"
        />
      ) : (
        <div className="max-h-72 overflow-auto rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 font-mono text-xs">
          {segments.map((segment, index) =>
            segment.type === 'text' ? (
              <pre key={index} className="whitespace-pre-wrap px-3 py-1 text-bolt-elements-textSecondary">
                {segment.text || ' '}
              </pre>
            ) : (
              <div key={index} className="my-1 border-y border-amber-500/30">
                <div className="flex flex-wrap items-center gap-1.5 bg-amber-500/10 px-3 py-1">
                  {(['ours', 'theirs', 'both'] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={classNames(
                        'min-h-11 rounded px-3 py-2 text-[11px] font-medium whitespace-normal',
                        choices[index] === side
                          ? 'bg-bolt-elements-item-contentAccent text-white'
                          : 'border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3',
                      )}
                      onClick={() => setChoices((current) => ({ ...current, [index]: side }))}
                    >
                      {side === 'ours'
                        ? copy['gitMergeEditor.accept.current']
                        : side === 'theirs'
                          ? copy['gitMergeEditor.accept.incoming']
                          : copy['gitMergeEditor.accept.both']}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 divide-y divide-bolt-elements-borderColor sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                  <pre
                    className={classNames(
                      'whitespace-pre-wrap px-3 py-1',
                      choices[index] === 'theirs' ? 'opacity-40' : 'bg-green-500/10 text-green-600 dark:text-green-300',
                    )}
                  >
                    {segment.ours || ' '}
                  </pre>
                  <pre
                    className={classNames(
                      'whitespace-pre-wrap px-3 py-1',
                      choices[index] === 'ours' ? 'opacity-40' : 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
                    )}
                  >
                    {segment.theirs || ' '}
                  </pre>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0 text-xs leading-relaxed text-bolt-elements-textSecondary">
          {rawMode
            ? stillHasMarkers
              ? copy['gitMergeEditor.status.removeMarkers']
              : copy['gitMergeEditor.status.ready']
            : allChosen
              ? copy['gitMergeEditor.status.allChosen']
              : formatGitMergeEditorCopy(copy['gitMergeEditor.status.choose'], {
                  chosen: chosenCount,
                  total: conflictIndexes.length,
                })}
        </span>
        <button
          type="button"
          data-testid="git-mark-resolved"
          disabled={busy || stillHasMarkers || (!rawMode && !allChosen)}
          className="min-h-11 shrink-0 rounded-md bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-60"
          onClick={() => onResolve(composed)}
        >
          {copy['gitMergeEditor.markResolved']}
        </button>
      </div>
    </div>
  );
}
