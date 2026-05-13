import { memo, useEffect, useRef, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    const trimmed = code.trim();

    if (!trimmed) {
      setStatus('done');
      setSvg(null);

      return () => {
        cancelled = true;
      };
    }

    setStatus('rendering');
    setErrorMessage(null);

    (async () => {
      try {
        const { default: mermaid } = await import('mermaid');

        const theme = themeStore.get() === 'dark' ? 'dark' : 'default';

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme,
          fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        });

        const id = `mermaid-${Math.random().toString(36).slice(2, 10)}`;
        const result = await mermaid.render(id, trimmed);

        if (!cancelled) {
          setSvg(result.svg);
          setStatus('done');

          if (containerRef.current) {
            result.bindFunctions?.(containerRef.current);
          }
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
  }, [code]);

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
        dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
      >
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
    </div>
  );
});

MermaidBlock.displayName = 'MermaidBlock';
