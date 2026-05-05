import { Component, type ErrorInfo, type ReactNode } from 'react';

interface PanelBoundaryProps {
  title: string;
  children: ReactNode;
}

interface PanelBoundaryState {
  error?: Error;
}

export class PanelBoundary extends Component<PanelBoundaryProps, PanelBoundaryState> {
  state: PanelBoundaryState = {};

  static getDerivedStateFromError(error: Error): PanelBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[PanelBoundary] ${this.props.title} failed`, error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <section
          className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-bolt-elements-background-depth-1 p-6 text-center"
          role="alert"
          aria-live="polite"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-md border border-bolt-elements-borderColor text-bolt-elements-textSecondary">
            <span className="i-ph:warning-duotone text-xl" aria-hidden />
          </div>
          <div className="max-w-sm">
            <h2 className="text-sm font-semibold text-bolt-elements-textPrimary">{this.props.title} failed to load</h2>
            <p className="mt-1 text-xs leading-5 text-bolt-elements-textSecondary">
              The panel state was isolated so the rest of the workspace can keep running.
            </p>
          </div>
          <button
            type="button"
            className="h-8 rounded-md border border-bolt-elements-borderColor px-3 text-xs text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2"
            onClick={() => this.setState({ error: undefined })}
          >
            Retry panel
          </button>
        </section>
      );
    }

    return this.props.children;
  }
}

export function PanelLoading({ title }: { title: string }) {
  return (
    <section
      className="flex h-full min-h-0 flex-col items-center justify-center gap-3 bg-bolt-elements-background-depth-1 p-6 text-center"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-bolt-elements-borderColor border-t-bolt-elements-textPrimary" />
      <p className="text-sm text-bolt-elements-textSecondary">{title}</p>
    </section>
  );
}
