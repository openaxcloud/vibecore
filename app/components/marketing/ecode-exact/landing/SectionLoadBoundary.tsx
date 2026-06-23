import { Component, type ReactNode } from 'react';

interface SectionLoadBoundaryProps {
  /**
   * Static fallback rendered when the lazy chunk fails to load. This is the same
   * skeleton already used as the Suspense `fallback`, so a chunk-load failure
   * degrades to a graceful placeholder instead of tearing down the page.
   */
  fallback: ReactNode;

  /** Section name, used only for diagnostics. */
  name: string;

  /**
   * Retry the failed import once before falling back. Defaults to true. A single
   * remount gives a transient network/CDN blip a chance to recover before we give
   * up and render the static fallback.
   */
  retryOnce?: boolean;
  children: ReactNode;
}

interface SectionLoadBoundaryState {
  failed: boolean;
  retried: boolean;
}

/**
 * Lightweight error boundary for a single deferred marketing section.
 *
 * `Suspense` only handles a *pending* lazy import; it does NOT catch a *rejected*
 * `import()` (stale hashed chunk after a deploy, CDN/network blip, ad-blocker, …).
 * Without a boundary that rejection unwinds past `Suspense` to the root error
 * boundary and replaces the ENTIRE landing page with the generic error screen.
 *
 * This boundary isolates the failure to its own section: it renders the section's
 * own skeleton fallback (after one optional silent retry) so the rest of the page
 * keeps working.
 */
export class SectionLoadBoundary extends Component<SectionLoadBoundaryProps, SectionLoadBoundaryState> {
  state: SectionLoadBoundaryState = { failed: false, retried: false };

  static getDerivedStateFromError(): Partial<SectionLoadBoundaryState> {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (typeof console !== 'undefined') {
      console.error(`[SectionLoadBoundary] ${this.props.name} failed to load`, error);
    }

    if (this.shouldRetry()) {
      /*
       * Remount the subtree once so the lazy import is re-attempted; if it fails
       * again `retried` is set and we fall through to the static fallback.
       */
      this.setState({ failed: false, retried: true });
    }
  }

  shouldRetry() {
    return this.props.retryOnce !== false && !this.state.retried;
  }

  render() {
    if (this.state.failed) {
      return this.props.fallback;
    }

    /*
     * Key the subtree on `retried` so clearing the error fully remounts the lazy
     * child (and re-fires the import) rather than re-rendering the identical
     * failing element in place.
     */
    return <div key={this.state.retried ? 'retry' : 'initial'}>{this.props.children}</div>;
  }
}
