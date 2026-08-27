import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatInspectorPanelPixels, getInspectorPanelCopy } from '~/lib/i18n/catalogs/inspector-panel';

interface ElementInfo {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  styles: Record<string, string>; // Changed from CSSStyleDeclaration
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
  };
}

interface InspectorPanelProps {
  selectedElement: ElementInfo | null;
  isVisible: boolean;
  onClose: () => void;
}

export const InspectorPanel = ({ selectedElement, isVisible, onClose }: InspectorPanelProps) => {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getInspectorPanelCopy(language);
  const [activeTab, setActiveTab] = useState<'styles' | 'computed' | 'box'>('styles');

  if (!isVisible || !selectedElement) {
    return null;
  }

  const getRelevantStyles = (styles: Record<string, string>) => {
    const relevantProps = [
      'display',
      'position',
      'width',
      'height',
      'margin',
      'padding',
      'border',
      'background',
      'color',
      'font-size',
      'font-family',
      'text-align',
      'flex-direction',
      'justify-content',
      'align-items',
    ];

    return relevantProps.reduce(
      (acc, prop) => {
        const value = styles[prop];

        if (value) {
          acc[prop] = value;
        }

        return acc;
      },
      {} as Record<string, string>,
    );
  };

  const relevantStyles = getRelevantStyles(selectedElement.styles);

  const tabs = [
    { id: 'styles' as const, label: copy['inspectorPanel.tabs.styles'] },
    { id: 'computed' as const, label: copy['inspectorPanel.tabs.computed'] },
    { id: 'box' as const, label: copy['inspectorPanel.tabs.box'] },
  ];

  return (
    <aside
      className="fixed inset-x-2 top-16 z-40 max-h-[calc(100dvh-4.5rem)] min-w-0 overflow-hidden rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-lg sm:inset-x-auto sm:right-4 sm:top-20 sm:w-80 sm:max-w-[calc(100vw-2rem)] sm:max-h-[calc(100dvh-6rem)]"
      aria-label={copy['inspectorPanel.title']}
    >
      {/* Header */}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-bolt-elements-borderColor p-3">
        <h3 className="min-w-0 break-words font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
          {copy['inspectorPanel.title']}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label={copy['inspectorPanel.close']}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)]"
        >
          <span className="i-ph:x" aria-hidden="true" />
        </button>
      </div>

      {/* Element Info */}
      <div className="min-w-0 border-b border-bolt-elements-borderColor p-3">
        <div className="text-sm">
          <div className="font-mono text-blue-500">
            {selectedElement.tagName.toLowerCase()}
            {selectedElement.id && <span className="text-green-500">#{selectedElement.id}</span>}
            {selectedElement.className && (
              <span className="text-yellow-500">.{selectedElement.className.split(' ')[0]}</span>
            )}
          </div>
          {selectedElement.textContent && (
            <div className="mt-1 truncate text-xs text-bolt-elements-textSecondary" title={selectedElement.textContent}>
              "{selectedElement.textContent}"
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex min-w-0 overflow-x-auto border-b border-bolt-elements-borderColor"
        role="tablist"
        aria-label={copy['inspectorPanel.tabs.ariaLabel']}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-11 min-w-0 flex-1 whitespace-normal px-3 py-2 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ecode-focus-ring)] ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-500 text-blue-500'
                : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-h-[min(24rem,calc(100dvh-15rem))] min-w-0 overflow-y-auto p-3">
        {activeTab === 'styles' && (
          <div className="space-y-2">
            {Object.entries(relevantStyles).map(([prop, value]) => (
              <div key={prop} className="flex min-w-0 justify-between gap-3 text-sm">
                <span className="min-w-0 break-all text-bolt-elements-textSecondary">{prop}:</span>
                <span className="min-w-0 break-all text-right font-mono text-bolt-elements-textPrimary">{value}</span>
              </div>
            ))}
            {Object.keys(relevantStyles).length === 0 ? (
              <p
                className="break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]"
                role="status"
              >
                {copy['inspectorPanel.styles.empty']}
              </p>
            ) : null}
          </div>
        )}

        {activeTab === 'computed' && (
          <div className="space-y-2">
            {Object.entries(selectedElement.styles).map(([prop, value]) => (
              <div key={prop} className="flex min-w-0 justify-between gap-3 text-sm">
                <span className="min-w-0 break-all text-bolt-elements-textSecondary">{prop}:</span>
                <span className="min-w-0 break-all text-right font-mono text-bolt-elements-textPrimary">{value}</span>
              </div>
            ))}
            {Object.keys(selectedElement.styles).length === 0 ? (
              <p
                className="break-words text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]"
                role="status"
              >
                {copy['inspectorPanel.computed.empty']}
              </p>
            ) : null}
          </div>
        )}

        {activeTab === 'box' && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">{copy['inspectorPanel.box.width']}:</span>
              <span className="text-bolt-elements-textPrimary">
                {formatInspectorPanelPixels(selectedElement.rect.width, language)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">{copy['inspectorPanel.box.height']}:</span>
              <span className="text-bolt-elements-textPrimary">
                {formatInspectorPanelPixels(selectedElement.rect.height, language)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">{copy['inspectorPanel.box.top']}:</span>
              <span className="text-bolt-elements-textPrimary">
                {formatInspectorPanelPixels(selectedElement.rect.top, language)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-bolt-elements-textSecondary">{copy['inspectorPanel.box.left']}:</span>
              <span className="text-bolt-elements-textPrimary">
                {formatInspectorPanelPixels(selectedElement.rect.left, language)}
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
