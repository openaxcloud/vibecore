import { useStore } from '@nanostores/react';
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
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
    setErrorMessage(null);

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
          setErrorMessage(error instanceof Error ? error.message : 'Failed to render diagram');
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, theme]);

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
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      logger.warn('Mermaid copy failed', error);
    }
  };

  return (
    <div className={classNames('bolt-mermaid-block group', className)} data-status={status}>
      <div className="bolt-mermaid-block-toolbar">
        <span className="bolt-mermaid-block-label">Mermaid diagram</span>
        <button
          type="button"
          className="bolt-mermaid-block-copy"
          onClick={copyToClipboard}
          aria-label={copied ? 'Copied' : 'Copy diagram source'}
          title={copied ? 'Copied' : 'Copy source'}
        >
          <span className={copied ? 'i-ph:check' : 'i-ph:copy'} aria-hidden />
        </button>
      </div>
      <div
        ref={containerRef}
        className="bolt-mermaid-block-canvas"
        role="img"
        aria-label="Mermaid diagram"
        dangerouslySetInnerHTML={{ __html: svg ?? '' }}
      />
      {!svg && status === 'rendering' ? <span className="bolt-mermaid-block-status">Rendering diagram…</span> : null}
      {status === 'error' ? (
        <div className="bolt-mermaid-block-error" role="alert">
          <p>
            <span className="i-ph:warning" aria-hidden /> Failed to render Mermaid diagram.
          </p>
          <p>{errorMessage}</p>
          <pre>{code}</pre>
        </div>
      ) : null}
    </div>
  );
});

MermaidBlock.displayName = 'MermaidBlock';
