import { useStore } from '@nanostores/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getChatRenderersCopy } from '~/lib/i18n/catalogs/chat-renderers';
import { themeStore } from '~/lib/stores/theme';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MermaidBlock');

type Status = 'idle' | 'rendering' | 'done' | 'error';

interface MermaidBlockProps {
  code: string;
  className?: string;
}

/**
 * Lazy-rendered Mermaid diagram. The `mermaid` runtime is loaded the first time
 * a block is mounted so it does not add weight to the initial chat bundle.
 * Re-renders when the source changes or the active theme flips between dark
 * and light.
 */
export const MermaidBlock = memo(({ code, className }: MermaidBlockProps) => {
  const { i18n } = useTranslation();
  const copy = getChatRenderersCopy(i18n.resolvedLanguage ?? i18n.language ?? 'en');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [renderAttempt, setRenderAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [svg, setSvg] = useState<string | null>(null);
  const bindFunctionsRef = useRef<((element: Element) => void) | null>(null);
  const theme = useStore(themeStore);

  useEffect(() => {
    let cancelled = false;

    const trimmed = code.trim();

    if (!trimmed) {
      setStatus('done');
      setSvg(null);
      bindFunctionsRef.current = null;

      return () => {
        cancelled = true;
      };
    }

    setStatus('rendering');
    setSvg(null);

    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');

        const mermaidTheme = theme === 'dark' ? 'dark' : 'default';

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: mermaidTheme,
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        });

        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const result = await mermaid.render(id, trimmed);

        if (!cancelled) {
          /*
           * Defer bindFunctions until the new SVG is committed to the DOM.
           * Calling it now would wire callbacks onto the previous render's
           * markup (still in the container), which the upcoming commit
           * replaces — silently dropping the interactive bindings.
           */
          bindFunctionsRef.current = result.bindFunctions ?? null;
          setSvg(result.svg);
          setStatus('done');
        }
      } catch (error) {
        logger.warn('Mermaid render failed', error);

        if (!cancelled) {
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, renderAttempt, theme]);

  useEffect(() => {
    if (copyStatus !== 'copied') {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopyStatus('idle'), 1500);

    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  /*
   * Wire up Mermaid's interactive bindings (click handlers, tooltips) only
   * after the freshly rendered SVG has been committed into the container.
   */
  useLayoutEffect(() => {
    const bindFunctions = bindFunctionsRef.current;

    if (svg && bindFunctions && containerRef.current) {
      bindFunctions(containerRef.current);
      bindFunctionsRef.current = null;
    }
  }, [svg]);

  const copyToClipboard = async () => {
    if (!navigator.clipboard?.writeText) {
      setCopyStatus('error');

      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('copied');
    } catch (error) {
      logger.warn('Mermaid copy failed', error);
      setCopyStatus('error');
    }
  };

  const copied = copyStatus === 'copied';

  return (
    <div className={classNames('bolt-mermaid-block group min-w-0', className)} data-status={status}>
      <div className="bolt-mermaid-block-toolbar min-w-0 flex-wrap gap-2">
        <span className="bolt-mermaid-block-label min-w-0 break-words">{copy['chatRenderers.mermaid.label']}</span>
        <button
          type="button"
          className="bolt-mermaid-block-copy min-h-11 min-w-11 shrink-0 focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
          onClick={copyToClipboard}
          aria-label={copied ? copy['chatRenderers.mermaid.copied'] : copy['chatRenderers.mermaid.copySource']}
          title={copied ? copy['chatRenderers.mermaid.copied'] : copy['chatRenderers.mermaid.copySource']}
        >
          <span className={copied ? 'i-ph:check' : 'i-ph:copy'} aria-hidden />
        </button>
      </div>
      {copyStatus === 'error' ? (
        <p
          className="m-0 break-words border-b border-bolt-elements-borderColor px-3 py-2 text-xs text-bolt-elements-icon-error"
          role="alert"
        >
          {copy['chatRenderers.mermaid.copyFailed']}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className="bolt-mermaid-block-canvas"
        role="img"
        aria-label={copy['chatRenderers.mermaid.canvas']}
        aria-busy={status === 'rendering'}
        dangerouslySetInnerHTML={{ __html: svg ?? '' }}
      />
      {!svg && status === 'rendering' ? (
        <span
          className="bolt-mermaid-block-status flex min-h-11 items-center gap-2 px-3 py-2"
          role="status"
          aria-live="polite"
        >
          <span className="i-svg-spinners:90-ring-with-bg" aria-hidden />
          {copy['chatRenderers.mermaid.rendering']}
        </span>
      ) : null}
      {status === 'error' ? (
        <div className="bolt-mermaid-block-error min-w-0" role="alert">
          <p className="flex min-w-0 flex-wrap items-center gap-1.5 break-words">
            <span className="i-ph:warning" aria-hidden />
            {copy['chatRenderers.mermaid.renderFailed']}
          </p>
          <p className="break-words">{copy['chatRenderers.mermaid.renderHelp']}</p>
          <button
            type="button"
            className="inline-flex min-h-11 min-w-11 w-fit max-w-full items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-button-secondary-background px-3 py-2 text-sm font-medium text-bolt-elements-button-secondary-text hover:bg-bolt-elements-button-secondary-backgroundHover focus:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive"
            onClick={() => setRenderAttempt((attempt) => attempt + 1)}
          >
            {copy['chatRenderers.mermaid.retry']}
          </button>
          <pre aria-label={copy['chatRenderers.mermaid.source']}>
            <code>{code}</code>
          </pre>
        </div>
      ) : null}
    </div>
  );
});

MermaidBlock.displayName = 'MermaidBlock';
