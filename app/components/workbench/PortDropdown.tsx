import { memo, useEffect, useRef } from 'react';
import type { PreviewInfo } from '~/lib/stores/previews';

interface PortDropdownProps {
  activePreviewIndex: number;
  setActivePreviewIndex: (index: number) => void;
  isDropdownOpen: boolean;
  setIsDropdownOpen: (value: boolean) => void;
  setHasSelectedPreview: (value: boolean) => void;
  previews: PreviewInfo[];
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
    const dropdownRef = useRef<HTMLDivElement>(null);

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
    }, [isDropdownOpen]);

    return (
      <div className="bolt-preview-port-dropdown relative z-port-dropdown" ref={dropdownRef}>
        {/* Display the active port if available, otherwise show the plug icon */}
        <button
          type="button"
          className="bolt-preview-port-button flex items-center group-focus-within:text-bolt-elements-preview-addressBar-text bg-white group-focus-within:bg-bolt-elements-preview-addressBar-background dark:bg-bolt-elements-preview-addressBar-backgroundHover rounded-full px-2 py-1 gap-1.5"
          aria-label="Select preview port"
          aria-expanded={isDropdownOpen}
          title="Select preview port"
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        >
          <span className="i-ph:plug text-base"></span>
          {previews.length > 0 && activePreviewIndex >= 0 && activePreviewIndex < previews.length ? (
            <span className="bolt-preview-port-label text-xs font-medium">{previews[activePreviewIndex].port}</span>
          ) : null}
        </button>
        {isDropdownOpen && (
          <div className="absolute left-0 mt-2 max-h-[min(320px,calc(100dvh-24px))] min-w-[min(140px,calc(100vw-24px))] max-w-[calc(100vw-24px)] overflow-auto rounded border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm dropdown-animation">
            <div className="px-4 py-2 border-b border-bolt-elements-borderColor text-sm font-semibold text-bolt-elements-textPrimary">
              Ports
            </div>
            {sortedPreviews.map((preview) => (
              <div
                key={preview.index}
                className="flex w-full items-center gap-2 px-4 py-2 hover:bg-bolt-elements-item-backgroundActive"
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 cursor-pointer text-left"
                  onClick={() => {
                    setActivePreviewIndex(preview.index);
                    setIsDropdownOpen(false);
                    setHasSelectedPreview(true);
                  }}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${preview.ready ? 'bg-green-500' : 'bg-amber-500'}`}
                    title={preview.ready ? 'Ready' : 'Starting'}
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
                  className="shrink-0 rounded p-1 text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary"
                  title="Copy preview URL"
                  aria-label={`Copy URL for port ${preview.port}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void navigator.clipboard?.writeText(preview.baseUrl).catch(() => {});
                  }}
                >
                  <span className="i-ph:copy text-sm" aria-hidden />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  },
);
