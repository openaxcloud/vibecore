import React, { Component, type ReactNode } from 'react';
import { getSettingsCoreCopy } from '~/lib/i18n/catalogs/settings-core';
import { classNames } from '~/utils/classNames';

interface Props {
  children: ReactNode;

  /**
   * Called when the user clicks "Retry". The parent should use this together with
   * a changing `retryKey` so the lazy subtree is fully remounted and `React.lazy`
   * re-attempts the dynamic import (a failed import is otherwise cached as rejected).
   */
  onRetry?: () => void;
  language?: string | null;
}

interface State {
  hasError: boolean;
}

/**
 * Local error boundary for a single settings panel.
 *
 * Settings tabs are loaded via `React.lazy()`. In production a dynamic `import()`
 * routinely rejects — a flaky network, or (very commonly) a returning user whose
 * browser requests a now-deleted hashed chunk after a fresh deploy. Without a
 * boundary here the rejected lazy promise throws during render and bubbles past
 * the Radix Dialog all the way to the app-root error boundary, replacing the
 * entire authenticated IDE/dashboard with the full-page error view.
 *
 * This boundary keeps the failure scoped to the one panel and offers an inline
 * retry instead.
 */
export class TabPanelBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Settings tab failed to load:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      const copy = getSettingsCoreCopy(this.props.language);

      return (
        <div className="mx-auto max-w-xl p-4 text-center sm:p-6" role="alert" aria-live="assertive" aria-atomic="true">
          <div
            className="i-ph:warning-circle mx-auto mb-3 h-10 w-10 text-[var(--status-warning-text)]"
            aria-hidden="true"
          />
          <p className="mb-1 text-sm font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
            {copy['settingsCore.boundary.title']}
          </p>
          <p className="mb-4 text-sm text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
            {copy['settingsCore.boundary.description']}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className={classNames(
              'vc-focus-ring inline-flex min-h-11 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium focus:outline-none',
              'bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] text-[var(--vc-ide-accent-action)]',
              'hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent)] transition-colors duration-200',
            )}
          >
            <span className="i-ph:arrow-clockwise h-4 w-4 shrink-0" aria-hidden="true" />
            {copy['settingsCore.boundary.retry']}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default TabPanelBoundary;
