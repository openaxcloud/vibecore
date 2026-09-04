import { useTranslation } from 'react-i18next';
import { useLocation, useRouteError } from 'react-router';
import { AsyncPanelError } from './AsyncPanelState';
import { AppShell, LinkButton } from './SaaSLayout';
import {
  defaultUserAreaTranslate,
  resolveUserAreaSurface,
  type UserAreaSurface,
  type UserAreaTranslate,
} from '~/lib/user-area-surface';

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

export function describeUserAreaRouteError(
  error: unknown,
  surface: UserAreaSurface,
  translate: UserAreaTranslate = defaultUserAreaTranslate,
): UserAreaErrorDescriptor {
  const status = errorStatus(error);

  if (status === 401) {
    return {
      title: translate('userArea.routeError.signInRequired'),
      description: translate('userArea.routeError.signInRequiredBody'),
      retryable: false,
      tone: 'warning',
      signInRequired: true,
    };
  }

  if (status === 403) {
    return {
      title: translate('userArea.routeError.accessRestricted'),
      description: translate('userArea.routeError.accessRestrictedBody'),
      retryable: false,
      tone: 'warning',
      signInRequired: false,
    };
  }

  if (status === 404) {
    return {
      title: translate('userArea.routeError.notFound', { surface: surface.title }),
      description: translate('userArea.routeError.notFoundBody'),
      retryable: false,
      tone: 'warning',
      signInRequired: false,
    };
  }

  if (status === 429) {
    return {
      title: translate('userArea.routeError.rateLimited', { surface: surface.title }),
      description: translate('userArea.routeError.rateLimitedBody'),
      retryable: true,
      tone: 'warning',
      signInRequired: false,
    };
  }

  return {
    title: translate('userArea.routeError.loadFailed', { surface: surface.title }),
    description: translate('userArea.routeError.loadFailedBody'),
    retryable: true,
    tone: 'error',
    signInRequired: false,
  };
}

export function UserAreaRouteErrorBoundary() {
  const { t } = useTranslation();
  const error = useRouteError();
  const location = useLocation();
  const translate: UserAreaTranslate = (key, values) => t(key, values);
  const surface = resolveUserAreaSurface(location.pathname, translate);
  const descriptor = describeUserAreaRouteError(error, surface, translate);
  const signInTarget = `/login?returnTo=${encodeURIComponent(`${location.pathname}${location.search}`)}`;

  /*
   * `serverSync={false}` : cette coque s'affiche aussi HORS session
   * (`signInRequired`), où `/api/user/preferences` répondrait 401 et ferait
   * journaliser une erreur de console au navigateur.
   */
  return (
    <AppShell
      title={surface.title}
      description={surface.description}
      serverSync={false}
      actions={
        <LinkButton to={descriptor.signInRequired ? signInTarget : surface.backTo} variant="outline">
          {descriptor.signInRequired ? t('userArea.routeError.signIn') : surface.backLabel}
        </LinkButton>
      }
    >
      <AsyncPanelError
        title={descriptor.title}
        description={descriptor.description}
        tone={descriptor.tone}
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
