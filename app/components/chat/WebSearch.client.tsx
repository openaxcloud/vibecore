import { useState, useRef, useEffect } from 'react';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import { classNames } from '~/utils/classNames';

interface WebSearchProps {
  onSearchResult: (result: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: 'icon' | 'menu';
}

interface WebSearchData {
  title: string;
  description: string;
  content: string;
  sourceUrl: string;
}

interface WebSearchResponse {
  success: boolean;
  data?: WebSearchData;
  error?: string;
}

function formatSearchResult(data: WebSearchData): string {
  const parts: string[] = [`[Web content from ${data.sourceUrl}]`];

  if (data.title) {
    parts.push(`Title: ${data.title}`);
  }

  if (data.description) {
    parts.push(`Description: ${data.description}`);
  }

  parts.push('', data.content);

  return parts.join('\n');
}

export function WebSearch({
  onSearchResult,
  disabled = false,
  triggerClassName,
  triggerLabel = 'Fetch URL',
  triggerVariant = 'icon',
}: WebSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMenuTrigger = triggerVariant === 'menu';

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleFetch = async () => {
    const trimmedUrl = url.trim();

    if (!trimmedUrl) {
      return;
    }

    setIsSearching(true);

    try {
      const response = await fetch('/api/web-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmedUrl }),
      });

      const result = (await response.json()) as WebSearchResponse;

      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Failed to fetch URL content');
      }

      onSearchResult(formatSearchResult(result.data));
      toast.success('URL content fetched');
      setUrl('');
      setIsOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch URL');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div ref={containerRef} className={classNames('relative', isMenuTrigger ? 'w-full' : undefined)}>
      <IconButton
        title="Fetch URL content"
        tooltip="Fetch URL content"
        disabled={disabled || isSearching}
        onClick={() => setIsOpen(!isOpen)}
        className={classNames(isMenuTrigger ? 'bolt-chatbox-tools-menu-item' : 'transition-all', triggerClassName)}
      >
        <>
          {isSearching ? (
            <div className="i-svg-spinners:90-ring-with-bg text-bolt-elements-loader-progress text-xl animate-spin" />
          ) : (
            <div className="i-ph:globe text-xl" />
          )}
          {isMenuTrigger ? <span>{triggerLabel}</span> : null}
        </>
      </IconButton>
      {isOpen && (
        <div
          className={classNames(
            'absolute bottom-full left-0 mb-2 flex w-[min(420px,calc(100vw-40px))] max-w-[calc(100vw-40px)] items-center gap-2',
            'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-lg',
            'bolt-web-url-panel',
          )}
        >
          <input
            ref={inputRef}
            type="url"
            aria-label="URL to fetch"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearching) {
                handleFetch();
              }

              if (e.key === 'Escape') {
                setIsOpen(false);
              }
            }}
            placeholder="https://example.com"
            disabled={isSearching}
            className={classNames(
              'min-w-0 flex-1 px-3 py-1.5 text-sm rounded-md',
              'border border-bolt-elements-borderColor',
              'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary',
              'placeholder-bolt-elements-textTertiary',
              'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
            )}
          />
          <button
            onClick={handleFetch}
            disabled={isSearching || !url.trim()}
            className={classNames(
              'px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap',
              'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text',
              'hover:bg-bolt-elements-button-primary-backgroundHover',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isSearching ? 'Fetching...' : 'Fetch'}
          </button>
        </div>
      )}
    </div>
  );
}
