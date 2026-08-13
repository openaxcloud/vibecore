import { useStore } from '@nanostores/react';
import { memo, useEffect, useState } from 'react';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import styles from './CodeBlock.module.scss';
import { themeStore } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CodeBlock');

interface CodeBlockProps {
  className?: string;
  code: string;
  language?: BundledLanguage | SpecialLanguage;
  theme?: 'light-plus' | 'dark-plus';
  disableCopy?: boolean;
}

export const CodeBlock = memo(
  ({ className, code, language = 'plaintext', theme, disableCopy = false }: CodeBlockProps) => {
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copied, setCopied] = useState(false);

    /* Follow the active app theme unless an explicit `theme` override is passed. */
    const activeTheme = useStore(themeStore);
    const effectiveTheme = theme ?? (activeTheme === 'light' ? 'light-plus' : 'dark-plus');

    const copyToClipboard = () => {
      if (copied) {
        return;
      }

      navigator.clipboard?.writeText(code)?.catch(() => {});

      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 2000);
    };

    useEffect(() => {
      let effectiveLanguage = language;

      if (language && !isSpecialLang(language) && !(language in bundledLanguages)) {
        logger.warn(`Unsupported language '${language}', falling back to plaintext`);
        effectiveLanguage = 'plaintext';
      }

      logger.trace(`Language = ${effectiveLanguage}`);

      /*
       * Guard against out-of-order async resolution. During streaming the `code` prop changes on
       * nearly every token, firing overlapping codeToHtml() calls whose latency varies. Without this
       * flag an earlier (stale) invocation could resolve after a later one and overwrite the final
       * code with outdated/truncated highlighted HTML.
       */
      let cancelled = false;

      const processCode = async () => {
        const highlighted = await codeToHtml(code, { lang: effectiveLanguage, theme: effectiveTheme });

        if (!cancelled) {
          setHTML(highlighted);
        }
      };

      processCode();

      return () => {
        cancelled = true;
      };
    }, [code, language, effectiveTheme]);

    /*
     * Show the language as a small badge (top-left) like GitHub/ChatGPT/Cursor so
     * the reader can tell a block is `tsx` vs `bash` at a glance. Hidden for
     * plaintext and special (non-syntax) langs where a label adds noise.
     */
    const languageLabel =
      language && language !== 'plaintext' && !isSpecialLang(language) ? String(language) : undefined;

    return (
      <div className={classNames('relative group text-left', className)}>
        {languageLabel && (
          <span
            className="absolute top-[10px] left-[12px] z-10 select-none rounded text-[10px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary opacity-70 group-hover:opacity-100"
            aria-hidden
          >
            {languageLabel}
          </span>
        )}
        <div
          className={classNames(
            styles.CopyButtonContainer,
            'bg-transparent absolute top-[10px] right-[10px] rounded-md z-10 text-lg flex items-center justify-center opacity-0 group-hover:opacity-100',
            {
              'rounded-l-0 opacity-100': copied,
            },
          )}
        >
          {!disableCopy && (
            <button
              className={classNames(
                styles.CopyButton,
                'flex items-center p-[6px] justify-center rounded-md transition-theme',
                {
                  'before:opacity-0': !copied,
                  'before:opacity-100': copied,
                },
              )}
              type="button"
              aria-label="Copy code"
              title="Copy Code"
              onClick={() => copyToClipboard()}
            >
              <div className="i-ph:clipboard-text-duotone" aria-hidden></div>
            </button>
          )}
        </div>
        <div dangerouslySetInnerHTML={{ __html: html ?? '' }}></div>
      </div>
    );
  },
);
