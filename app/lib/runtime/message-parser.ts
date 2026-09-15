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
  /**
   * `true` quand l'artefact a été fermé par le FILET DE FIN DE FLUX et non par
   * une balise `</boltArtifact>` reçue. Sert à mesurer la fréquence réelle des
   * flux tronqués : sans cette distinction, une fermeture de secours est
   * indiscernable d'une fermeture normale et le chiffre reste introuvable.
   */
  fermetureDeSecours?: boolean;
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

  /**
   * Texte BRUT de l'action en cours, tel qu'il a streamé, tant qu'aucune
   * balise `</boltAction>` n'a été trouvée.
   *
   * Pourquoi ce champ existe : la branche de streaming ci-dessous n'écrit
   * JAMAIS dans `currentAction.content` — elle recalcule le contenu depuis
   * `input.slice(i)` à chaque passe et sort par `break`, en laissant
   * `state.position` au DÉBUT du contenu. `currentAction.content` ne reçoit
   * quelque chose qu'au moment où la balise fermante est trouvée. Mesuré sur
   * le parseur réel : à la coupure, `currentAction.content` vaut `''`.
   *
   * Conséquence : le filet de fin de flux, qui n'a pas `input`, n'avait aucun
   * moyen de retrouver le travail déjà streamé — il aurait fermé l'action sur
   * un fichier VIDE, ce qui est pire que de ne pas la fermer.
   *
   * L'affectation est idempotente : `state.position` ne bouge pas tant que
   * l'action n'est pas fermée, donc chaque passe réécrit le même préfixe
   * étendu. Remis à `undefined` à chaque fermeture ou redémarrage d'action.
   */
  contenuBrutEnCours?: string;
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

  /*
   * MESURÉ, ET C'EST LE CŒUR DU CORRECTIF : exiger « 3 spans colorés + un
   * <br/> » ne suffisait PAS. Un composant React parfaitement ordinaire
   *
   *     <span className="text-slate-500">Total</span>
   *     <br />
   *     <span className="text-green-600">{montant}</span>
   *     <span className="text-gray-400">{devise}</span>
   *
   * franchit ce seuil, et le nettoyage lui ARRACHE ses balises : les trois
   * `<span>` et le `<br />` disparaissent du fichier écrit. C'est la deuxième
   * fois que ce même mécanisme mord — le commentaire au-dessus raconte la
   * première, où un seul `text-*` suffisait. Monter le seuil ne fait que
   * déplacer la frontière ; il en faut une qui ne dépende pas du nombre.
   *
   * LA VRAIE DIFFÉRENCE n'est pas la quantité de spans, c'est ce qu'il y a
   * AUTOUR. Une sortie de coloration syntaxique enveloppe CHAQUE jeton : ses
   * lignes commencent par `<span …>`, jamais par un mot-clé nu. Un module
   * source, lui, porte sa structure en clair — `import`, `export`, une
   * déclaration, une fermeture de bloc — hors de toute balise.
   *
   * Cette marque-là ne se contourne pas en ajoutant un span de plus, et elle
   * n'affecte QUE la branche fragile : les deux signatures certaines (une
   * classe de coloriseur connue, un `style="color:"` en ligne) continuent de
   * décider seules, parce qu'elles ne se produisent pas dans du code écrit à
   * la main.
   */
  const porteUneStructureDeModule =
    /^\s*(?:import|export)\s/m.test(content) ||
    /^\s*(?:const|let|var|function|class|async\s+function)\s/m.test(content) ||
    /^\s*(?:def|package|using|#include)\s/m.test(content);

  const signatureCertaine =
    /(?:class|className)=["'][^"']*\b(?:shiki|hljs|token|highlight)\b/i.test(content) ||
    /<span\b[^>]*\bstyle=["'][^"']*color\s*:/i.test(content);

  const looksLikeHighlightedSource =
    /&nbsp;|<br\s*\/?>/i.test(content) &&
    (signatureCertaine || ((colorTokenSpans?.length ?? 0) >= 3 && !porteUneStructureDeModule));

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
            state.contenuBrutEnCours = undefined;
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
            state.contenuBrutEnCours = undefined;

            i = closeIndex + ARTIFACT_ACTION_TAG_CLOSE.length;
          } else {
            /*
             * Mémoriser le partiel BRUT avant toute mise en forme, et pour
             * TOUS les types d'action — les deux branches ci-dessous ne
             * couvrent que `file` et `diff`, une action `shell` tronquée ne
             * passerait nulle part. Affectation et non concaténation : la
             * position de reprise ne bouge pas tant que l'action est ouverte,
             * chaque passe re-slice donc le même contenu, en plus long.
             */
            state.contenuBrutEnCours = input.slice(i);

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

  /**
   * FILET DE FIN DE FLUX — ferme un artefact resté ouvert.
   *
   * `onArtifactClose` n'est émis QUE sur une balise `</boltArtifact>` trouvée
   * dans le flux (voir la boucle de `parse`). C'est l'unique site du dépôt qui
   * pose `closed: true`, et il n'a aucun repli. Si le modèle termine sans
   * fermer — flux tronqué par une limite de jetons, erreur de fournisseur,
   * abandon de l'utilisateur — l'artefact reste ouvert POUR TOUJOURS.
   *
   * Ce qui pend à cette fermeture, et ne s'exécute alors jamais :
   *
   *   - **la persistance des fichiers vers le stockage durable** — le travail
   *     de l'agent n'est jamais enregistré. C'est la conséquence grave : du
   *     code produit, affiché, et perdu ;
   *   - la réparation du manifeste d'aperçu, d'où l'épinglage de port perdu
   *     (mesuré : 193 projets sur 289 en production) ;
   *   - la validation des imports et le redémarrage de l'aperçu.
   *
   * Même mécanisme que le défaut de juillet sur `</boltAction>` (« Agent edit
   * truncation », perte de données) — une balise plus haut, jamais vérifiée
   * quand celle du dessous a été corrigée.
   *
   * Rend `true` si un artefact a effectivement été fermé, pour que l'appelant
   * puisse le journaliser et compter.
   */
  fermerArtefactsOuverts(messageId: string): boolean {
    const state = this.#messages.get(messageId);

    if (!state?.insideArtifact || !state.currentArtifact) {
      return false;
    }

    const artefact = state.currentArtifact;

    /*
     * FERMER D'ABORD L'ACTION, PUIS L'ARTEFACT — dans cet ordre, et pas
     * l'inverse.
     *
     * Ce filet ne fermait que l'artefact. MESURÉ sur le parseur réel, flux
     * coupé au milieu du second fichier :
     *
     *   ouvertes ..  actionOpen:src/App.tsx  +  actionOpen:src/main.tsx
     *   fermées ...  actionClose:src/App.tsx  — SEULEMENT
     *
     * Le fichier en cours au moment de la coupure — le dernier écrit, donc
     * très souvent le point d'entrée — n'était jamais finalisé : `onActionClose`
     * est ce qui déclenche l'exécution NON streamée de l'action
     * (`workbenchStore.runAction(data)`), et il ne partait pas. Cela explique
     * la mesure de production « l'index.html réclame /src/main.tsx qui
     * n'existe pas » : ce n'est pas le fichier qui manque au plan du modèle,
     * c'est sa fermeture qui manque au nôtre.
     *
     * Le commentaire de cette méthode nommait déjà la parenté : « même
     * mécanisme que le défaut de juillet sur </boltAction> ». Le filet avait
     * été posé une balise trop haut.
     *
     * Le contenu subit EXACTEMENT le même traitement que sur le chemin normal
     * — `trim`, nettoyage de fichier hors markdown, saut de ligne final — sans
     * quoi le fichier finalisé par le filet différerait de celui finalisé par
     * une balise reçue, et le filet introduirait sa propre corruption.
     */
    if (state.insideAction && state.currentAction) {
      const action = state.currentAction as BoltAction & { content: string };

      /*
       * Récupérer le travail DÉJÀ STREAMÉ. `action.content` vaut `''` à cet
       * instant — la branche de streaming de `parse` ne l'alimente jamais (voir
       * `contenuBrutEnCours`). Fermer sans cette ligne écrirait un fichier VIDE
       * par-dessus le code affiché à l'écran : une perte de données pire que
       * l'action laissée ouverte.
       *
       * `withoutTrailingCloseTagPrefix` retire une balise fermante coupée en
       * plein milieu (`</bo`, `</antml`, …) : sur un flux tronqué elle n'arrivera
       * jamais, et sans ce retrait elle finirait littéralement dans le fichier.
       */
      action.content += withoutTrailingCloseTagPrefix(state.contenuBrutEnCours ?? '');

      let content = action.content.trim();

      if ('type' in action && action.type === 'file') {
        if (!action.filePath?.endsWith('.md')) {
          content = cleanFileActionContent(content, action.filePath);

          /*
           * La clôture ``` n'arrivera pas non plus : `cleanoutMarkdownSyntax`
           * exige les DEUX barrières et laisse donc la première en place. Sur
           * une fermeture normale c'est sans objet ; ici le fichier finalisé
           * commencerait par une ligne ```lang. Même retrait que la branche de
           * streaming, pour la même raison.
           */
          content = content.replace(/^\s*```[a-zA-Z0-9]*\n/, '');
        }

        content += '\n';
      }

      action.content = content;

      state.insideAction = false;
      state.currentAction = { content: '' };
      state.contenuBrutEnCours = undefined;

      this._options.callbacks?.onActionClose?.({
        artifactId: artefact.id,
        messageId,

        /* Même décrément que le chemin normal : l'identifiant a déjà été incrémenté à l'ouverture. */
        actionId: String(state.actionId - 1),

        action,
      });
    }

    state.insideArtifact = false;
    state.currentArtifact = undefined;

    this._options.callbacks?.onArtifactClose?.({
      messageId,
      artifactId: artefact.id,
      ...artefact,
      fermetureDeSecours: true,
    });

    return true;
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
