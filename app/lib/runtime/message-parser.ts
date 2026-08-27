import { clientStoresServicesText } from '~/lib/i18n/catalogs/client-stores-services';
import type {
  ActionType,
  BoltAction,
  BoltActionData,
  DiffAction,
  FileAction,
  ShellAction,
  SupabaseAction,
} from '~/types/actions';
import type { BoltArtifactData } from '~/types/artifact';
import { createScopedLogger } from '~/utils/logger';
import { stripTransportMarkup, trailingTransportFragmentLength } from '~/utils/transport-markup';
import { unreachable } from '~/utils/unreachable';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ARTIFACT_ACTION_TAG_OPEN = '<boltAction';
const ARTIFACT_ACTION_TAG_CLOSE = '</boltAction>';
const BOLT_QUICK_ACTIONS_OPEN = '<bolt-quick-actions>';
const BOLT_QUICK_ACTIONS_CLOSE = '</bolt-quick-actions>';

const logger = createScopedLogger('MessageParser');

/**
 * When an action's content is streamed before its `</boltAction>` closing tag
 * has fully arrived, the tail of the current buffer can be a PARTIAL close tag
 * split across chunk boundaries (e.g. `…});\n</bo`). Emitting that tail into the
 * streamed editor preview — or worse, autosaving it — corrupts the file with a
 * stray `</bo` and, when the model's output is truncated mid-tag, `onActionClose`
 * (which strips the real tag) never fires, so the garbage is what lands on disk.
 *
 * This trims the longest trailing suffix of `content` that is a proper prefix of
 * `</boltAction>` so a split close tag is held back until the next chunk resolves
 * it (the closing-tag path re-scans the full buffer and emits the exact slice).
 * The delimiter is pure ASCII, so this never splits a multi-byte UTF-8 character.
 */
function withoutTrailingCloseTagPrefix(content: string): string {
  const max = Math.min(content.length, ARTIFACT_ACTION_TAG_CLOSE.length - 1);

  let hold = 0;

  for (let k = max; k > 0; k--) {
    if (content.endsWith(ARTIFACT_ACTION_TAG_CLOSE.slice(0, k))) {
      hold = k;
      break;
    }
  }

  /*
   * BUG-AGENT-TRANSPORT-MARKUP — the same hazard, but for the model's own
   * function-call transport markup. A stream that dies mid-wrapper leaves a tail
   * like `…}\n</antml`, which is NOT a prefix of `</boltAction>` and so slipped
   * through the loop above and was autosaved verbatim into ten prod files.
   * Hold back the longer of the two candidate tails.
   */
  hold = Math.max(hold, trailingTransportFragmentLength(content));

  return hold > 0 ? content.slice(0, content.length - hold) : content;
}

export interface ArtifactCallbackData extends BoltArtifactData {
  messageId: string;
  artifactId?: string;
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action: BoltAction;
}

export type ArtifactCallback = (data: ArtifactCallbackData) => void;
export type ActionCallback = (data: ActionCallbackData) => void;

export interface ParserCallbacks {
  onArtifactOpen?: ArtifactCallback;
  onArtifactClose?: ArtifactCallback;
  onActionOpen?: ActionCallback;
  onActionStream?: ActionCallback;
  onActionClose?: ActionCallback;
}

interface ElementFactoryProps {
  messageId: string;
  artifactId?: string;
}

type ElementFactory = (props: ElementFactoryProps) => string;

export interface StreamingMessageParserOptions {
  callbacks?: ParserCallbacks;
  artifactElement?: ElementFactory;
}

interface MessageState {
  position: number;
  insideArtifact: boolean;
  insideAction: boolean;
  artifactCounter: number;
  currentArtifact?: BoltArtifactData;
  currentAction: BoltActionData;
  actionId: number;
}

function cleanoutMarkdownSyntax(content: string) {
  const codeBlockRegex = /^\s*```\w*\n([\s\S]*?)\n\s*```\s*$/;
  const match = content.match(codeBlockRegex);

  // console.log('matching', !!match, content);

  if (match) {
    return match[1]; // Remove common leading 4-space indent
  } else {
    return content;
  }
}

function decodeHtmlEntities(content: string) {
  return content
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#123;/g, '{')
    .replace(/&#125;/g, '}')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&amp;/g, '&');
}

function cleanHighlightedCodeMarkup(content: string) {
  /*
   * Only treat content as syntax-highlighter output when it carries an ACTUAL
   * highlighter fingerprint: a shiki/hljs/prism class, shiki's inline `color:`
   * style, OR a DENSE run of Tailwind `text-<color>-<n>` token spans. Some models
   * emit highlighted code using Tailwind palette classes (one span per token), so
   * we must still clean those — but keying off a SINGLE generic `text-*` className
   * mistook ordinary JSX like `<span className="text-red-500">x</span><br/>` for
   * highlighted markup and stripped its real tags on write (file corruption).
   * Requiring 3+ such spans alongside <br/>/&nbsp; separates real highlighter
   * output (wraps every token) from a stray colored span in genuine source.
   */
  const colorTokenSpans = content.match(/<span\b[^>]*\b(?:class|className)=["'][^"']*\btext-[a-z]+-\d{2,3}\b/gi);

  const looksLikeHighlightedSource =
    /&nbsp;|<br\s*\/?>/i.test(content) &&
    (/(?:class|className)=["'][^"']*\b(?:shiki|hljs|token|highlight)\b/i.test(content) ||
      /<span\b[^>]*\bstyle=["'][^"']*color\s*:/i.test(content) ||
      (colorTokenSpans?.length ?? 0) >= 3);

  if (!looksLikeHighlightedSource) {
    return content;
  }

  return decodeHtmlEntities(
    content
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?span\b[^>]*>/gi, '')
      .replace(/<\/?code\b[^>]*>/gi, '')
      .replace(/<\/?pre\b[^>]*>/gi, ''),
  );
}

export function cleanFileActionContent(content: string, _filePath?: string) {
  /*
   * Markdown fences are always stripped. HTML-entity decoding, however, must NOT
   * be applied unconditionally: source files (.tsx/.jsx/.ts/.js/.css/.scss, …)
   * legitimately contain HTML entities in JSX text and string/CSS content
   * (e.g. `return <p>a &lt; b</p>;` or `<span>{count} &amp;&amp; valid</span>`),
   * and blindly running cleanEscapedTags() rewrote `&lt;` -> `<`, producing
   * invalid JSX / silently corrupted text on every write.
   *
   * Entity decoding only makes sense when the content is actually syntax-highlighter
   * output (where entities encode the rendered source). That is exactly what
   * cleanHighlightedCodeMarkup() gates on via a highlighter fingerprint, and it
   * decodes entities itself when (and only when) that fingerprint is present.
   * So for ALL extensions we strip fences + run the gated highlighter cleanup and
   * never call an unconditional entity decode.
   */
  const stripped = cleanoutMarkdownSyntax(content);

  /*
   * BUG-AGENT-TRANSPORT-MARKUP — drop any COMPLETE transport wrapper the model
   * emitted inside the action body (e.g. `…code…</invoke>` right before the
   * real `</boltAction>`). The write boundary strips these too, but doing it
   * here keeps the streamed editor preview clean and means the content the
   * action commits already matches what lands on disk.
   */
  return stripTransportMarkup(cleanHighlightedCodeMarkup(stripped)).content;
}
export class StreamingMessageParser {
  #messages = new Map<string, MessageState>();
  #artifactCounter = 0;

  constructor(private _options: StreamingMessageParserOptions = {}) {}

  parse(messageId: string, input: string) {
    let state = this.#messages.get(messageId);

    if (!state) {
      state = {
        position: 0,
        insideAction: false,
        insideArtifact: false,
        artifactCounter: 0,
        currentAction: { content: '' },
        actionId: 0,
      };

      this.#messages.set(messageId, state);
    }

    let output = '';
    let i = state.position;
    let earlyBreak = false;

    while (i < input.length) {
      if (input.startsWith(BOLT_QUICK_ACTIONS_OPEN, i)) {
        const actionsBlockEnd = input.indexOf(BOLT_QUICK_ACTIONS_CLOSE, i);

        if (actionsBlockEnd !== -1) {
          const actionsBlockContent = input.slice(i + BOLT_QUICK_ACTIONS_OPEN.length, actionsBlockEnd);

          // Find all <bolt-quick-action ...>label</bolt-quick-action> inside
          const quickActionRegex = /<bolt-quick-action([^>]*)>([\s\S]*?)<\/bolt-quick-action>/g;

          let match;

          const buttons = [];

          while ((match = quickActionRegex.exec(actionsBlockContent)) !== null) {
            const tagAttrs = match[1];
            const label = match[2];
            const type = this.#extractAttribute(tagAttrs, 'type');
            const message = this.#extractAttribute(tagAttrs, 'message');
            const path = this.#extractAttribute(tagAttrs, 'path');
            const href = this.#extractAttribute(tagAttrs, 'href');
            buttons.push(
              createQuickActionElement(
                { type: type || '', message: message || '', path: path || '', href: href || '' },
                label,
              ),
            );
          }
          output += createQuickActionGroup(buttons);
          i = actionsBlockEnd + BOLT_QUICK_ACTIONS_CLOSE.length;
          continue;
        }

        /*
         * Open marker is present but the closing tag hasn't streamed in yet.
         * Stop here and wait for more input — otherwise the fall-through
         * artifact-tag scanner emits the partial marker as raw text and
         * advances past it, so the block is never recognized once it completes.
         */
        break;
      }

      if (state.insideArtifact) {
        const currentArtifact = state.currentArtifact;

        if (currentArtifact === undefined) {
          unreachable('Artifact not initialized');
        }

        if (state.insideAction) {
          const closeIndex = input.indexOf(ARTIFACT_ACTION_TAG_CLOSE, i);

          /*
           * BUG-AGENT-004 — the model restarted mid-action.
           *
           * When generation hits the token cap inside a file, the model
           * continues in the SAME message: prose ("Je continue la génération…")
           * followed by a fresh <boltArtifact>/<boltAction> re-emitting the
           * whole file. `insideAction` was still true, so all of that — prose
           * AND literal markup — was appended as FILE CONTENT. Proven live
           * (2026-08-15): src/App.tsx shipped with its import block twice, the
           * sentence, and a literal `<boltAction …>` line at line 23; Vite
           * answered 500 on it and the preview stayed blank.
           *
           * A new action opening before the current one ever closed means the
           * partial is abandoned output. Drop it and reparse from the new tag —
           * the re-emission that follows is the content the model actually
           * meant to deliver.
           *
           * Caveat accepted: a file whose own content contains a literal
           * `<boltAction` opener is cut short here. That is strictly better
           * than the previous behaviour, which corrupted the file outright.
           */
          const restartIndex = input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);

          if (restartIndex !== -1 && (closeIndex === -1 || restartIndex < closeIndex)) {
            state.insideAction = false;
            state.currentAction = { content: '' };
            i = restartIndex;

            continue;
          }

          const currentAction = state.currentAction;

          if (closeIndex !== -1) {
            currentAction.content += input.slice(i, closeIndex);

            let content = currentAction.content.trim();

            if ('type' in currentAction && currentAction.type === 'file') {
              // Remove markdown code block syntax if present and file is not markdown
              if (!currentAction.filePath?.endsWith('.md')) {
                content = cleanFileActionContent(content, currentAction.filePath);
              }

              content += '\n';
            }

            /*
             * A `diff` action intentionally takes NONE of the file-only
             * massaging above (fence strip, highlighter cleanup, trailing
             * newline): its `content` must round-trip byte-exact so the
             * increment-3 applier sees the raw `<<<<<<< / ======= / >>>>>>>`
             * search/replace markers unaltered. It shares only the outer
             * `.trim()` — identical to every non-file action (e.g. shell) — so
             * surrounding prose/whitespace is dropped while the block itself is
             * preserved verbatim.
             */

            currentAction.content = content;

            this._options.callbacks?.onActionClose?.({
              artifactId: currentArtifact.id,
              messageId,

              /**
               * We decrement the id because it's been incremented already
               * when `onActionOpen` was emitted to make sure the ids are
               * the same.
               */
              actionId: String(state.actionId - 1),

              action: currentAction as BoltAction,
            });

            state.insideAction = false;
            state.currentAction = { content: '' };

            i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
          } else {
            if ('type' in currentAction && currentAction.type === 'file') {
              /*
               * Hold back a trailing PARTIAL close tag (`</bo`, `</`, `<`, …) so a
               * `</boltAction>` split across chunk boundaries never leaks into the
               * streamed editor preview or an autosave-before-close. Without this,
               * a model whose output is truncated mid-tag leaves the file with a
               * stray `</bo` and no `onActionClose` ever fires to strip it.
               */
              let content = withoutTrailingCloseTagPrefix(input.slice(i));

              if (!currentAction.filePath?.endsWith('.md')) {
                content = cleanFileActionContent(content, currentAction.filePath);

                /*
                 * The closing ``` hasn't streamed in yet, so cleanoutMarkdownSyntax
                 * (which requires both fences) can't strip the opening fence. Strip
                 * a leading ```lang line here so the streamed editor preview — and
                 * any save of it before the action closes — doesn't keep a literal
                 * ```lang first line.
                 */
                content = content.replace(/^\s*```[a-zA-Z0-9]*\n/, '');
              }

              this._options.callbacks?.onActionStream?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: {
                  ...(currentAction as FileAction),
                  content,
                  filePath: currentAction.filePath,
                },
              });
            } else if ('type' in currentAction && currentAction.type === 'diff') {
              /*
               * Diff (anchored search/replace) content must round-trip
               * BYTE-EXACT so the increment-3 applier sees the exact
               * `<<<<<<< SEARCH` / `=======` / `>>>>>>> REPLACE` markers. Stream
               * the RAW accumulated text with NONE of the file-only massaging
               * that runs above — no markdown-fence stripping, no
               * highlighter-markup cleanup, no leading-fence removal — any of
               * which could rewrite a marker line and corrupt the block. This
               * only drives the live render; nothing is applied mid-stream.
               */
              this._options.callbacks?.onActionStream?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId - 1),
                action: {
                  ...(currentAction as DiffAction),

                  /*
                   * Hold back a trailing partial `</boltAction>` (see file branch above);
                   * the byte-exact final content is emitted by the closing-tag path.
                   */
                  content: withoutTrailingCloseTagPrefix(input.slice(i)),
                  filePath: currentAction.filePath,
                },
              });
            }

            break;
          }
        } else {
          const actionOpenIndex = input.indexOf(ARTIFACT_ACTION_TAG_OPEN, i);
          const artifactCloseIndex = input.indexOf(ARTIFACT_TAG_CLOSE, i);

          if (actionOpenIndex !== -1 && (artifactCloseIndex === -1 || actionOpenIndex < artifactCloseIndex)) {
            const actionEndIndex = this.#findTagClose(input, actionOpenIndex);

            if (actionEndIndex !== -1) {
              state.insideAction = true;

              state.currentAction = this.#parseActionTag(input, actionOpenIndex, actionEndIndex);

              this._options.callbacks?.onActionOpen?.({
                artifactId: currentArtifact.id,
                messageId,
                actionId: String(state.actionId++),
                action: state.currentAction as BoltAction,
              });

              i = actionEndIndex + 1;
            } else {
              break;
            }
          } else if (artifactCloseIndex !== -1) {
            this._options.callbacks?.onArtifactClose?.({
              messageId,
              artifactId: currentArtifact.id,
              ...currentArtifact,
            });

            state.insideArtifact = false;
            state.currentArtifact = undefined;

            i = artifactCloseIndex + ARTIFACT_TAG_CLOSE.length;
          } else {
            break;
          }
        }
      } else if (input[i] === '<' && input[i + 1] !== '/') {
        /*
         * Wait for more input if the buffer ends partway through a
         * quick-actions open marker that was split across stream chunks.
         * Without this, the scanner below emits the partial `<bolt-` as raw
         * text and advances past the `<`, so the block is never recognized
         * once the full marker arrives.
         */
        if (input.length - i < BOLT_QUICK_ACTIONS_OPEN.length && BOLT_QUICK_ACTIONS_OPEN.startsWith(input.slice(i))) {
          break;
        }

        let j = i;
        let potentialTag = '';

        while (j < input.length && potentialTag.length < ARTIFACT_TAG_OPEN.length) {
          potentialTag += input[j];

          if (potentialTag === ARTIFACT_TAG_OPEN) {
            const nextChar = input[j + 1];

            if (nextChar && nextChar !== '>' && nextChar !== ' ') {
              output += input.slice(i, j + 1);
              i = j + 1;
              break;
            }

            const openTagEnd = input.indexOf('>', j);

            if (openTagEnd !== -1) {
              const artifactTag = input.slice(i, openTagEnd + 1);

              const artifactTitle = this.#extractAttribute(artifactTag, 'title') as string;
              const type = this.#extractAttribute(artifactTag, 'type') as string;

              // const artifactId = this.#extractAttribute(artifactTag, 'id') as string;
              const artifactId = `${messageId}-${state.artifactCounter++}`;

              if (!artifactTitle) {
                logger.warn('Artifact title missing');
              }

              if (!artifactId) {
                logger.warn('Artifact id missing');
              }

              state.insideArtifact = true;

              const currentArtifact = {
                id: artifactId,
                title: artifactTitle,
                type,
              } satisfies BoltArtifactData;

              state.currentArtifact = currentArtifact;

              this._options.callbacks?.onArtifactOpen?.({
                messageId,
                artifactId: currentArtifact.id,
                ...currentArtifact,
              });

              const artifactFactory = this._options.artifactElement ?? createArtifactElement;

              output += artifactFactory({ messageId, artifactId });

              i = openTagEnd + 1;
            } else {
              earlyBreak = true;
            }

            break;
          } else if (!ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
            output += input.slice(i, j + 1);
            i = j + 1;
            break;
          }

          j++;
        }

        if (j === input.length && ARTIFACT_TAG_OPEN.startsWith(potentialTag)) {
          break;
        }
      } else {
        /*
         * Note: Auto-file-creation from code blocks is now handled by EnhancedMessageParser
         * to avoid duplicate processing and provide better shell command detection
         */
        output += input[i];
        i++;
      }

      if (earlyBreak) {
        break;
      }
    }

    state.position = i;

    return output;
  }

  reset() {
    this.#messages.clear();
  }

  resetMessage(messageId: string) {
    this.#messages.delete(messageId);
  }

  /**
   * Find the index of the `>` that closes the opening tag starting at `from`,
   * skipping any `>` that appears inside a quoted attribute value. A naive
   * indexOf('>') mis-terminates the tag when an attribute value (e.g. a
   * filePath or message) legitimately contains a `>` character.
   */
  #findTagClose(input: string, from: number): number {
    let quote: string | null = null;

    for (let k = from; k < input.length; k++) {
      const ch = input[k];

      if (quote) {
        if (ch === quote) {
          quote = null;
        }
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        return k;
      }
    }

    return -1;
  }

  #parseActionTag(input: string, actionOpenIndex: number, actionEndIndex: number) {
    const actionTag = input.slice(actionOpenIndex, actionEndIndex + 1);

    const actionType = this.#extractAttribute(actionTag, 'type') as ActionType;

    const actionAttributes = {
      type: actionType,
      content: '',
    };

    if (actionType === 'supabase') {
      const operation = this.#extractAttribute(actionTag, 'operation');

      if (!operation || !['migration', 'query'].includes(operation)) {
        logger.warn(`Invalid or missing operation for Supabase action: ${operation}`);
        throw new Error(
          clientStoresServicesText('clientRuntime.messageParser.supabaseOperationInvalid', {
            operation: operation || clientStoresServicesText('clientRuntime.messageParser.operationUnknown'),
          }),
        );
      }

      (actionAttributes as SupabaseAction).operation = operation as 'migration' | 'query';

      if (operation === 'migration') {
        const filePath = this.#extractAttribute(actionTag, 'filePath');

        if (!filePath) {
          logger.warn('Migration requires a filePath');
          throw new Error(clientStoresServicesText('clientRuntime.messageParser.migrationPathRequired'));
        }

        (actionAttributes as SupabaseAction).filePath = filePath;
      }
    } else if (actionType === 'file') {
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('File path not specified');
      }

      (actionAttributes as FileAction).filePath = filePath;
    } else if (actionType === 'diff') {
      /*
       * A diff (anchored search/replace) action carries the same `filePath`
       * attribute as a file action; its `content` is the raw search/replace
       * block text. Parsing/accumulation is identical to a file action here —
       * the difference is only in how the runner applies it (increment 3/5).
       */
      const filePath = this.#extractAttribute(actionTag, 'filePath') as string;

      if (!filePath) {
        logger.debug('Diff action filePath not specified');
      }

      (actionAttributes as DiffAction).filePath = filePath;
    } else if (!['shell', 'start'].includes(actionType)) {
      logger.warn(`Unknown action type '${actionType}'`);
    }

    return actionAttributes as FileAction | ShellAction | DiffAction;
  }

  #extractAttribute(tag: string, attributeName: string): string | undefined {
    /*
     * Require a non-name char (or start) before the attribute so e.g. `path`
     * doesn't match inside `filePath="…"`.
     */
    const match = tag.match(new RegExp(`(?:^|[^\\w-])${attributeName}="([^"]*)"`, 'i'));
    return match ? match[1] : undefined;
  }
}

const createArtifactElement: ElementFactory = (props) => {
  const elementProps = [
    'class="__boltArtifact__"',
    ...Object.entries(props).map(([key, value]) => {
      return `data-${camelToDashCase(key)}=${JSON.stringify(value)}`;
    }),
  ];

  return `<div ${elementProps.join(' ')}></div>`;
};

function camelToDashCase(input: string) {
  return input.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

function createQuickActionElement(props: Record<string, string>, label: string) {
  const elementProps = [
    'class="__boltQuickAction__"',
    'data-bolt-quick-action="true"',
    ...Object.entries(props).map(([key, value]) => `data-${camelToDashCase(key)}=${JSON.stringify(value)}`),
  ];

  return `<button ${elementProps.join(' ')}>${label}</button>`;
}

function createQuickActionGroup(buttons: string[]) {
  return `<div class=\"__boltQuickAction__\" data-bolt-quick-action=\"true\">${buttons.join('')}</div>`;
}
