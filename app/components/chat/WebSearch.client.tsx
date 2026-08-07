import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { IconButton } from '~/components/ui/IconButton';
import {
  formatChatBoxWebContent,
  getChatBoxChildrenCopy,
  getWebSearchSafeError,
  type ChatBoxWebContent,
} from '~/lib/i18n/catalogs/chat-box-children';
import { classNames } from '~/utils/classNames';

interface WebSearchProps {
  onSearchResult: (result: string) => void;
  disabled?: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerVariant?: 'icon' | 'menu';
}

type WebSearchData = ChatBoxWebContent;

interface WebSearchResponse {
  success: boolean;
  data?: WebSearchData;
  error?: string;
}

export function WebSearch({
  onSearchResult,
  disabled = false,
  triggerClassName,
  triggerLabel,
  triggerVariant = 'icon',
}: WebSearchProps) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getChatBoxChildrenCopy(language);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [url, setUrl] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMenuTrigger = triggerVariant === 'menu';
  const resolvedTriggerLabel = triggerLabel ?? copy['chatBoxChildren.web.triggerLabel'];

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
        console.error('Web URL fetch returned an unsuccessful response', result.error);
        toast.error(getWebSearchSafeError(language, result.error));

        return;
      }

      onSearchResult(formatChatBoxWebContent(result.data, language));
      toast.success(copy['chatBoxChildren.web.success']);
      setUrl('');
      setIsOpen(false);
    } catch (error) {
      console.error('Web URL fetch failed', error);
      toast.error(getWebSearchSafeError(language, error));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div ref={containerRef} className={classNames('relative', isMenuTrigger ? 'w-full' : undefined)}>
      <IconButton
        title={copy['chatBoxChildren.web.triggerTitle']}
        tooltip={copy['chatBoxChildren.web.triggerTitle']}
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
          {isMenuTrigger ? (
            <span className="min-w-0 !overflow-visible !whitespace-normal break-words leading-snug">
              {resolvedTriggerLabel}
            </span>
          ) : null}
        </>
      </IconButton>
      {isOpen && (
        <div
          role="group"
          aria-label={copy['chatBoxChildren.web.triggerTitle']}
          className={classNames(
            'absolute bottom-full left-0 mb-2 flex w-[min(420px,calc(100vw-24px))] max-w-[calc(100vw-24px)] flex-col items-stretch gap-2 sm:flex-row sm:items-center',
            'rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-2 shadow-lg',
            'bolt-web-url-panel',
          )}
        >
          <input
            ref={inputRef}
            type="url"
            aria-label={copy['chatBoxChildren.web.inputAria']}
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
              'min-h-11 min-w-0 flex-1 rounded-md px-3 py-2 text-sm',
              'border border-bolt-elements-borderColor',
              'bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary',
              'placeholder-bolt-elements-textTertiary',
              'focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus',
            )}
          />
          <button
            type="button"
            onClick={handleFetch}
            disabled={isSearching || !url.trim()}
            className={classNames(
              'min-h-11 w-full rounded-md px-3 py-2 text-sm font-medium whitespace-normal break-words leading-snug sm:w-auto',
              'bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text',
              'hover:bg-bolt-elements-button-primary-backgroundHover',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {isSearching ? copy['chatBoxChildren.web.fetching'] : copy['chatBoxChildren.web.fetch']}
          </button>
        </div>
      )}
    </div>
  );
}
