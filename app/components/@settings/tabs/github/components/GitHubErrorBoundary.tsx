import { AlertTriangle } from 'lucide-react';
import React, { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  getSourceControlConnectionsCopy,
  type SourceControlConnectionsCopy,
} from '~/lib/i18n/catalogs/source-control-connections';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
}

interface InternalProps extends Props {
  copy: SourceControlConnectionsCopy;
}

class GitHubErrorBoundaryCore extends Component<InternalProps, State> {
  constructor(props: InternalProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_error: Error): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GitHub Error Boundary caught an error:', error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center space-y-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-4 text-center sm:p-8"
          role="alert"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--status-error-bg)]">
            <AlertTriangle className="h-6 w-6 text-[var(--status-error-text)]" aria-hidden="true" />
          </div>

          <div>
            <h3 className="mb-2 text-lg font-medium text-bolt-elements-textPrimary">
              {this.props.copy['sourceControl.github.boundary.title']}
            </h3>
            <p className="text-sm text-bolt-elements-textSecondary mb-4 max-w-md">
              {this.props.copy['sourceControl.github.boundary.description']}
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" onClick={this.handleRetry} className="min-h-11 whitespace-normal">
              {this.props.copy['sourceControl.github.boundary.retry']}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.reload()}
              className="min-h-11 whitespace-normal"
            >
              {this.props.copy['sourceControl.github.boundary.reload']}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function GitHubErrorBoundary(props: Props) {
  const { i18n } = useTranslation();
  const copy = getSourceControlConnectionsCopy(i18n.resolvedLanguage ?? i18n.language);

  return <GitHubErrorBoundaryCore {...props} copy={copy} />;
}

// Higher-order component for wrapping components with error boundary
export function withGitHubErrorBoundary<P extends object>(component: React.ComponentType<P>) {
  return function WrappedComponent(props: P) {
    return <GitHubErrorBoundary>{React.createElement(component, props)}</GitHubErrorBoundary>;
  };
}

// Hook for handling async errors in GitHub operations
export function useGitHubErrorHandler() {
  const { i18n } = useTranslation();
  const copy = getSourceControlConnectionsCopy(i18n.resolvedLanguage ?? i18n.language);

  const handleError = React.useCallback(
    (error: unknown, context?: string) => {
      console.error(`GitHub Error ${context ? `(${context})` : ''}:`, error);

      /*
       * You could integrate with error tracking services here
       * For example: Sentry, LogRocket, etc.
       */

      return copy['sourceControl.common.connectionError'];
    },
    [copy],
  );

  return { handleError };
}
