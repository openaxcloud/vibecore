import { useLocation, useRouteError } from 'react-router';
import { AsyncPanelError } from './AsyncPanelState';
import { AppShell, LinkButton } from './SaaSLayout';
import { resolveUserAreaSurface, type UserAreaSurface } from '~/lib/user-area-surface';

export { resolveUserAreaSurface } from '~/lib/user-area-surface';

type UserAreaErrorDescriptor = {
  title: string;
  description: string;
  retryable: boolean;
  tone: 'error' | 'warning';
  signInRequired: boolean;
};

function errorStatus(error: unknown): number | null {
  if (error instanceof Response) {
    return error.status;
  }

  if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }

  return null;
}

export function describeUserAreaRouteError(error: unknown, surface: UserAreaSurface): UserAreaErrorDescriptor {
  const status = errorStatus(error);

  if (status === 401) {
    return {
      title: 'Sign in required',
      description: 'Your session ended before this page could load. Sign in again to continue.',
      retryable: false,
      tone: 'warning',
      signInRequired: true,
    };
  }

  if (status === 403) {
    return {
      title: 'Access restricted',
      description: 'Your current role does not include access to this page. No data was changed.',
      retryable: false,
      tone: 'warning',
      signInRequired: false,
    };
  }

  if (status === 404) {
    return {
      title: `${surface.title} was not found`,
      description: 'The requested resource may have been removed or you may no longer have access to it.',
      retryable: false,
      tone: 'warning',
      signInRequired: false,
    };
  }

  if (status === 429) {
    return {
      title: `${surface.title} is temporarily limited`,
      description: 'Too many requests were made in a short period. Wait a moment, then try again.',
      retryable: true,
      tone: 'warning',
      signInRequired: false,
    };
  }

  return {
    title: `${surface.title} could not load`,
    description:
      'The latest request failed, so this page is hidden to avoid showing incomplete data. No data was changed.',
    retryable: true,
    tone: 'error',
    signInRequired: false,
  };
}

export function UserAreaRouteErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const surface = resolveUserAreaSurface(location.pathname);
  const descriptor = describeUserAreaRouteError(error, surface);
  const signInTarget = `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  return (
    <AppShell
      title={surface.title}
      description={surface.description}
      actions={
        <LinkButton to={descriptor.signInRequired ? signInTarget : surface.backTo} variant="outline">
          {descriptor.signInRequired ? 'Sign in' : surface.backLabel}
        </LinkButton>
      }
    >
      <AsyncPanelError
        title={descriptor.title}
        description={descriptor.description}
        tone={descriptor.tone}
        retryLabel="Try again"
        onRetry={
          descriptor.retryable
            ? () => {
                window.location.reload();
              }
            : undefined
        }
      />
    </AppShell>
  );
}
