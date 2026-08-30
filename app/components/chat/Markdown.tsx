import 'katex/dist/katex.min.css';
import type { Message } from 'ai';
import { memo, useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown, { type Components } from 'react-markdown';
import type { BundledLanguage } from 'shiki';
import { Artifact, openArtifactInWorkbench } from './Artifact';
import { CodeBlock } from './CodeBlock';
import styles from './Markdown.module.scss';
import { MermaidBlock } from './MermaidBlock';
import ThoughtBox from './ThoughtBox';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
import type { ProviderInfo } from '~/types/model';
import { createScopedLogger } from '~/utils/logger';
import { rehypePlugins, remarkPlugins, allowedHTMLElements } from '~/utils/markdown';

const logger = createScopedLogger('MarkdownComponent');

function quickActionIconClass(type: string): string {
  if (type === 'file') {
    return 'i-ph:file';
  }

  if (type === 'message') {
    return 'i-ph:chats';
  }

  if (type === 'implement') {
    return 'i-ph:code';
  }

  if (type === 'link') {
    return 'i-ph:link';
  }

  return 'i-ph:question';
}

function LocalizedThoughtBox({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);

  return <ThoughtBox title={copy['chatResiduals.markdown.thoughtProcess']}>{children}</ThoughtBox>;
}

interface MarkdownProps {
  children: string;
  html?: boolean;
  limitedMarkdown?: boolean;
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
}

export const Markdown = memo(
  ({ children, html = false, limitedMarkdown = false, append, setChatMode, model, provider }: MarkdownProps) => {
    logger.trace('Render');

    const components = useMemo(() => {
      return {
        div: ({ className, children, node, ...props }) => {
          const dataProps = node?.properties as Record<string, unknown>;

          if (className?.includes('__boltArtifact__')) {
            const messageId = node?.properties.dataMessageId as string;
            const artifactId = node?.properties.dataArtifactId as string;

            if (!messageId) {
              logger.error(`Invalid message id ${messageId}`);
            }

            if (!artifactId) {
              logger.error(`Invalid artifact id ${artifactId}`);
            }

            return <Artifact messageId={messageId} artifactId={artifactId} />;
          }

          if (className?.includes('__boltSelectedElement__')) {
            const messageId = node?.properties.dataMessageId as string;
            const elementDataAttr = node?.properties.dataElement as string;

            // Parse the element data if it exists
            let elementData: any = null;

            if (elementDataAttr) {
              try {
                elementData = JSON.parse(elementDataAttr);
              } catch (e) {
                console.error('Failed to parse element data:', e);
              }
            }

            if (!messageId) {
              logger.error(`Invalid message id ${messageId}`);
            }

            return (
              <div className="bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg p-3 my-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono bg-bolt-elements-background-depth-2 px-2 py-1 rounded text-bolt-elements-textTer">
                    {elementData?.tagName}
                  </span>
                  {elementData?.className && (
                    <span className="text-xs text-bolt-elements-textSecondary">.{elementData.className}</span>
                  )}
                </div>
                <code className="block text-sm !text-bolt-elements-textSecondary !bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor p-2 rounded">
                  {elementData?.displayText}
                </code>
              </div>
            );
          }

          if (className?.includes('__boltThought__')) {
            return <LocalizedThoughtBox>{children}</LocalizedThoughtBox>;
          }

          if (className?.includes('__boltQuickAction__') || dataProps?.dataBoltQuickAction) {
            return <div className="flex items-center gap-2 flex-wrap mt-3.5">{children}</div>;
          }

          return (
            <div className={className} {...props}>
              {children}
            </div>
          );
        },
        pre: (props) => {
          const { children, node, ...rest } = props;

          const [firstChild] = node?.children ?? [];

          if (
            firstChild &&
            firstChild.type === 'element' &&
            firstChild.tagName === 'code' &&
            firstChild.children[0]?.type === 'text'
          ) {
            const { className, ...codeProps } = firstChild.properties;
            const [, language = 'plaintext'] = /language-(\w+)/.exec(String(className) || '') ?? [];

            if (language === 'mermaid') {
              return <MermaidBlock code={firstChild.children[0].value} />;
            }

            return (
              <CodeBlock code={firstChild.children[0].value} language={language as BundledLanguage} {...codeProps} />
            );
          }

          return <pre {...rest}>{children}</pre>;
        },
        button: ({ node, children, ...props }) => {
          const dataProps = node?.properties as Record<string, unknown>;

          if (
            dataProps?.class?.toString().includes('__boltQuickAction__') ||
            dataProps?.dataBoltQuickAction === 'true'
          ) {
            const type = dataProps['data-type'] || dataProps.dataType;
            const message = dataProps['data-message'] || dataProps.dataMessage;
            const path = dataProps['data-path'] || dataProps.dataPath;
            const href = dataProps['data-href'] || dataProps.dataHref;

            const safeType = typeof type === 'string' ? type : '';
            const iconClass = quickActionIconClass(safeType);

            return (
              <button
                className="rounded-md justify-center px-3 py-1.5 text-xs bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent opacity-90 hover:opacity-100 flex items-center gap-2 cursor-pointer"
                data-type={type}
                data-message={message}
                data-path={path}
                data-href={href}
                onClick={() => {
                  if (type === 'file') {
                    openArtifactInWorkbench(path);
                  } else if (type === 'message' && append) {
                    append({
                      id: `quick-action-message-${Date.now()}`,
                      content: [
                        {
                          type: 'text',
                          text: message,
                        },
                      ] as any,
                      role: 'user',
                    });
                    console.log('Message appended:', message);
                  } else if (type === 'implement' && append && setChatMode) {
                    setChatMode('build');
                    append({
                      id: `quick-action-implement-${Date.now()}`,
                      content: [
                        {
                          type: 'text',
                          text: message,
                        },
                      ] as any,
                      role: 'user',
                    });
                  } else if (type === 'link' && typeof href === 'string') {
                    try {
                      const url = new URL(href, window.location.origin);

                      /*
                       * Only open http(s): a model-authored `javascript:`/`data:`
                       * href would otherwise execute script in our origin (XSS).
                       */
                      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                        console.error('Blocked non-http(s) link:', href);
                      } else {
                        window.open(url.toString(), '_blank', 'noopener,noreferrer');
                      }
                    } catch (error) {
                      console.error('Invalid URL:', href, error);
                    }
                  }
                }}
              >
                <div className={`text-lg ${iconClass}`} />
                {children}
              </button>
            );
          }

          return <button {...props}>{children}</button>;
        },
      } satisfies Components;
    }, [append, setChatMode, model, provider]);

    /*
     * Memoize the plugin arrays + stripped content so a streaming re-render that
     * doesn't change `children` (e.g. a sibling state update) doesn't rebuild the
     * remark/rehype pipeline and re-tokenize the whole document. Combined with the
     * useChat throttle this keeps streaming markdown smooth.
     */
    const memoRemarkPlugins = useMemo(() => remarkPlugins(limitedMarkdown), [limitedMarkdown]);
    const memoRehypePlugins = useMemo(() => rehypePlugins(html), [html]);
    const strippedChildren = useMemo(() => stripCodeFenceFromArtifact(children), [children]);

    /*
     * Markdown supprime les espaces de BORD d'un document — comportement normal
     * pour un document entier, destructeur pour un FRAGMENT.
     *
     * Constaté : « I will add a `users` table » s'affichait « auserstable ».
     * Rendu en trois segments — le texte, le code inline, la suite — chaque
     * segment perd ses espaces de bord et la concaténation les colle. Le même
     * effet apparaît pendant le streaming : un morceau qui se termine juste
     * après un code inline perd son espace final jusqu'à l'arrivée du suivant,
     * et le texte tressaute.
     *
     * On restitue donc ce que le rendu a retiré. Un contenu sans espace de bord
     * — le cas d'un message complet — n'est pas touché : les deux fragments
     * sont vides et rien n'est ajouté.
     */
    const [leadingSpace, trailingSpace] = useMemo(() => {
      const lead = /^[^\S\n]+/.exec(strippedChildren)?.[0] ?? '';
      const trail = strippedChildren.trim() === '' ? '' : (/[^\S\n]+$/.exec(strippedChildren)?.[0] ?? '');

      return [lead, trail] as const;
    }, [strippedChildren]);

    return (
      <>
        {leadingSpace}
        <ReactMarkdown
          allowedElements={allowedHTMLElements}
          className={styles.MarkdownContent}
          components={components}
          remarkPlugins={memoRemarkPlugins}
          rehypePlugins={memoRehypePlugins}
        >
          {strippedChildren}
        </ReactMarkdown>
        {trailingSpace}
      </>
    );
  },
);

/**
 * Removes code fence markers (```) surrounding an artifact element while preserving the artifact content.
 * This is necessary because artifacts should not be wrapped in code blocks when rendered for rendering action list.
 *
 * @param content - The markdown content to process
 * @returns The processed content with code fence markers removed around artifacts
 *
 * @example
 * // Removes code fences around artifact
 * const input = "```xml\n<div class='__boltArtifact__'></div>\n```";
 * stripCodeFenceFromArtifact(input);
 * // Returns: "\n<div class='__boltArtifact__'></div>\n"
 *
 * @remarks
 * - Only removes code fences that directly wrap an artifact (marked with __boltArtifact__ class)
 * - Handles code fences with optional language specifications (e.g. ```xml, ```typescript)
 * - Preserves original content if no artifact is found
 * - Safely handles edge cases like empty input or artifacts at start/end of content
 */
export const stripCodeFenceFromArtifact = (content: string) => {
  if (!content || !content.includes('__boltArtifact__')) {
    return content;
  }

  const lines = content.split('\n');
  const artifactLineIndex = lines.findIndex((line) => line.includes('__boltArtifact__'));

  // Return original content if artifact line not found
  if (artifactLineIndex === -1) {
    return content;
  }

  // Check previous line for code fence
  if (artifactLineIndex > 0 && lines[artifactLineIndex - 1]?.trim().match(/^```\w*$/)) {
    lines[artifactLineIndex - 1] = '';
  }

  if (artifactLineIndex < lines.length - 1 && lines[artifactLineIndex + 1]?.trim().match(/^```$/)) {
    lines[artifactLineIndex + 1] = '';
  }

  return lines.join('\n');
};
