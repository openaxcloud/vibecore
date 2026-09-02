import { useStore } from '@nanostores/react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { bundledLanguages, codeToHtml, isSpecialLang, type BundledLanguage, type SpecialLanguage } from 'shiki';
import styles from './CodeBlock.module.scss';
import { useCoarsePointer } from '~/lib/hooks/useCoarsePointer';
import { getChatResidualsCopy } from '~/lib/i18n/catalogs/chat-residuals';
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
    const { i18n } = useTranslation();
    const copy = getChatResidualsCopy(i18n.resolvedLanguage ?? i18n.language);
    const coarse = useCoarsePointer();
    const [html, setHTML] = useState<string | undefined>(undefined);
    const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
    const [highlightFailed, setHighlightFailed] = useState(false);
    const copyResetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    /* Follow the active app theme unless an explicit `theme` override is passed. */
    const activeTheme = useStore(themeStore);
    const effectiveTheme = theme ?? (activeTheme === 'light' ? 'light-plus' : 'dark-plus');

    const copyToClipboard = async () => {
      if (copyStatus === 'copied') {
        return;
      }

      if (copyResetTimer.current) {
        clearTimeout(copyResetTimer.current);
      }

      try {
        if (!navigator.clipboard) {
          throw new Error();
        }

        await navigator.clipboard.writeText(code);
        setCopyStatus('copied');
      } catch {
        setCopyStatus('failed');
      }

      copyResetTimer.current = setTimeout(() => {
        setCopyStatus('idle');
      }, 2000);
    };

    useEffect(
      () => () => {
        if (copyResetTimer.current) {
          clearTimeout(copyResetTimer.current);
        }
      },
      [],
    );

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
        try {
          const highlighted = await codeToHtml(code, { lang: effectiveLanguage, theme: effectiveTheme });

          if (!cancelled) {
            setHTML(highlighted);
            setHighlightFailed(false);
          }
        } catch (error) {
          logger.error('Syntax highlighting failed', error);

          if (!cancelled) {
            setHTML(undefined);
            setHighlightFailed(true);
          }
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
            className="absolute top-[10px] left-[12px] z-10 select-none rounded text-[11px] font-medium uppercase tracking-wide text-bolt-elements-textTertiary opacity-70 group-hover:opacity-100"
            aria-hidden
          >
            {languageLabel}
          </span>
        )}
        <div
          className={classNames(
            styles.CopyButtonContainer,
            'absolute right-[10px] top-[10px] z-10 flex items-center justify-center rounded-md bg-transparent text-lg',
            /*
             * Le repli par POINT DE RUPTURE (`sm:`) couvrait le telephone mais
             * pas la TABLETTE tactile : a 768 ou 1024 px, `sm:` s'applique et il
             * n'y a pourtant pas plus de survol qu'a 390. On decide donc sur le
             * POINTEUR, pas sur la largeur.
             */
            coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100',
            {
              'rounded-l-0 opacity-100': copyStatus !== 'idle',
            },
          )}
        >
          {copyStatus !== 'idle' ? (
            <span
              className="absolute right-full mr-1 flex min-h-8 max-w-[min(240px,calc(100vw-80px))] items-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-2 py-1 text-xs text-bolt-elements-textPrimary shadow-lg"
              role="status"
            >
              {copyStatus === 'copied' ? copy['chatResiduals.code.copied'] : copy['chatResiduals.code.copyFailed']}
            </span>
          ) : null}
          {!disableCopy && (
            <button
              className={classNames(
                styles.CopyButton,
                'flex min-h-11 min-w-11 items-center justify-center rounded-md p-[6px] transition-theme before:!hidden',
              )}
              type="button"
              aria-label={copyStatus === 'copied' ? copy['chatResiduals.code.copied'] : copy['chatResiduals.code.copy']}
              title={copy['chatResiduals.code.copy']}
              onClick={() => void copyToClipboard()}
            >
              <div className="i-ph:clipboard-text-duotone" aria-hidden></div>
            </button>
          )}
        </div>
        {highlightFailed ? (
          <div>
            <p className="px-3 pt-3 text-xs text-bolt-elements-textSecondary" role="status">
              {copy['chatResiduals.code.highlightFailed']}
            </p>
            <pre className="overflow-auto p-3 text-xs text-bolt-elements-textPrimary">
              <code>{code}</code>
            </pre>
          </div>
        ) : (
          <div dangerouslySetInnerHTML={{ __html: html ?? '' }}></div>
        )}
      </div>
    );
  },
);
