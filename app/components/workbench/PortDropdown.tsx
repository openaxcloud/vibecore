import { memo, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatWorkspaceMiscCopy, getWorkspaceMiscCopy } from '~/lib/i18n/catalogs/workspace-misc';
import type { PreviewInfo } from '~/lib/stores/previews';

interface PortDropdownProps {
  activePreviewIndex: number;
  setActivePreviewIndex: (index: number) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (value: boolean) => void;
  setHasSelectedPreview: (value: boolean) => void;
  previews: PreviewInfo[];
}

interface CopyFeedback {
  tone: 'success' | 'error';
  port: number;
}

export const PortDropdown = memo(
  ({
    activePreviewIndex,
    setActivePreviewIndex,
    isDropdownOpen,
    setIsDropdownOpen,
    setHasSelectedPreview,
    previews,
  }: PortDropdownProps) => {
    const { i18n } = useTranslation();
    const copy = getWorkspaceMiscCopy(i18n.resolvedLanguage ?? i18n.language);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const dropdownId = useId();
    const [copyFeedback, setCopyFeedback] = useState<CopyFeedback | null>(null);

    // sort previews, preserving original index
    const sortedPreviews = previews
      .map((previewInfo, index) => ({ ...previewInfo, index }))
      .sort((a, b) => a.port - b.port);

    // close dropdown if user clicks outside
    useEffect(() => {
      if (!isDropdownOpen) {
        return undefined;
      }

      /*
       * Bind the outside-click listener only while open and remove it via the
       * cleanup. The previous version also called removeEventListener on a
       * DIFFERENT handler instance in an else branch (a no-op that never matched
       * the bound listener) — dead code that obscured the actual lifecycle.
       */
      const handleClickOutside = (event: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
          setIsDropdownOpen(false);
        }
      };

      window.addEventListener('mousedown', handleClickOutside);

      return () => {
        window.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isDropdownOpen, setIsDropdownOpen]);

    useEffect(() => {
      if (!isDropdownOpen) {
        setCopyFeedback(null);
      }
    }, [isDropdownOpen]);

    const copyPreviewUrl = async (preview: PreviewInfo) => {
      try {
        if (!navigator.clipboard?.writeText) {
          throw new Error();
        }

        await navigator.clipboard.writeText(preview.baseUrl);
        setCopyFeedback({ tone: 'success', port: preview.port });
      } catch {
        setCopyFeedback({ tone: 'error', port: preview.port });
      }
    };

    return (
      <div className="bolt-preview-port-dropdown relative z-port-dropdown" ref={dropdownRef}>
        {/* Display the active port if available, otherwise show the plug icon */}
        <button
          type="button"
          className="bolt-preview-port-button flex min-h-11 min-w-11 items-center gap-1.5 rounded-full bg-white px-2 py-1 group-focus-within:bg-bolt-elements-preview-addressBar-background group-focus-within:text-bolt-elements-preview-addressBar-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] dark:bg-bolt-elements-preview-addressBar-backgroundHover"
          aria-label={copy['workspaceMisc.portDropdown.select']}
          aria-expanded={isDropdownOpen}
          aria-controls={dropdownId}
          aria-haspopup="dialog"
          title={copy['workspaceMisc.portDropdown.select']}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span className="i-ph:plug text-base"></span>
          {previews.length > 0 && activePreviewIndex >= 0 && activePreviewIndex < previews.length ? (
            <span className="bolt-preview-port-label text-xs font-medium">{previews[activePreviewIndex].port}</span>
          ) : null}
        </button>
        {isDropdownOpen && (
          <div
            id={dropdownId}
            role="dialog"
            aria-label={copy['workspaceMisc.portDropdown.heading']}
            className="dropdown-animation absolute left-0 mt-2 max-h-[min(320px,calc(100dvh-24px))] min-w-[min(180px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-auto rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm"
          >
            <div className="break-words border-b border-bolt-elements-borderColor px-4 py-2 text-sm font-semibold text-bolt-elements-textPrimary">
              {copy['workspaceMisc.portDropdown.heading']}
            </div>
            {sortedPreviews.length === 0 ? (
              <p role="status" className="max-w-64 break-words px-4 py-3 text-xs text-bolt-elements-textSecondary">
                {copy['workspaceMisc.portDropdown.empty']}
              </p>
            ) : null}
            {sortedPreviews.map((preview) => (
              <div
                key={preview.index}
                data-active={activePreviewIndex === preview.index ? 'true' : undefined}
                className="flex min-h-11 w-full items-center gap-2 px-2 hover:bg-bolt-elements-item-backgroundActive"
              >
                <button
                  type="button"
                  aria-label={formatWorkspaceMiscCopy(copy['workspaceMisc.portDropdown.port.aria'], {
                    port: preview.port,
                    status: preview.ready
                      ? copy['workspaceMisc.portDropdown.status.ready']
                      : copy['workspaceMisc.portDropdown.status.starting'],
                  })}
                  className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                  onClick={() => {
                    setActivePreviewIndex(preview.index);
                    setIsDropdownOpen(false);
                    setHasSelectedPreview(true);
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${preview.ready ? 'bg-green-500' : 'bg-amber-500'}`}
                    title={
                      preview.ready
                        ? copy['workspaceMisc.portDropdown.status.ready']
                        : copy['workspaceMisc.portDropdown.status.starting']
                    }
                    aria-hidden
                  />
                  <span
                    className={
                      activePreviewIndex === preview.index
                        ? 'text-bolt-elements-item-contentAccent'
                        : 'text-bolt-elements-item-contentDefault group-hover:text-bolt-elements-item-contentActive'
                    }
                  >
                    {preview.port}
                  </span>
                </button>
                <button
                  type="button"
                  className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
                  title={copy['workspaceMisc.portDropdown.copy.title']}
                  aria-label={formatWorkspaceMiscCopy(copy['workspaceMisc.portDropdown.copy.aria'], {
                    port: preview.port,
                  })}
                  onClick={(event) => {
                    event.stopPropagation();
                    void copyPreviewUrl(preview);
                  }}
                >
                  <span className="i-ph:copy text-sm" aria-hidden />
                </button>
              </div>
            ))}
            {copyFeedback ? (
              <p
                role={copyFeedback.tone === 'error' ? 'alert' : 'status'}
                className={`max-w-64 break-words border-t border-bolt-elements-borderColor px-4 py-2 text-xs ${
                  copyFeedback.tone === 'error'
                    ? 'text-[var(--status-error-text)]'
                    : 'text-[var(--status-success-text)]'
                }`}
              >
                {formatWorkspaceMiscCopy(
                  copy[
                    copyFeedback.tone === 'error'
                      ? 'workspaceMisc.portDropdown.copy.error'
                      : 'workspaceMisc.portDropdown.copy.success'
                  ],
                  { port: copyFeedback.port },
                )}
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  },
);
