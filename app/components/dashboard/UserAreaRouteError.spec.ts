import { describe, expect, it } from 'vitest';
import { describeUserAreaRouteError, resolveUserAreaSurface } from './UserAreaRouteError';
import { userAreaFr, type UserAreaTranslationKey } from '~/lib/i18n/catalogs/user-area';

function frenchTranslate(key: UserAreaTranslationKey, values?: Readonly<Record<string, string | number>>) {
  return Object.entries(values ?? {}).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    userAreaFr[key],
  );
}

describe('user-area route error presentation', () => {
  it('maps critical and project routes to stable user-facing surface names', () => {
    expect(resolveUserAreaSurface('/api-keys')).toMatchObject({ title: 'API keys', backTo: '/security-settings' });
    expect(resolveUserAreaSurface('/projects/project-1/activity')).toMatchObject({
      title: 'Project activity',
      backTo: '/projects',
    });
    expect(resolveUserAreaSurface('/unknown-user-area-route')).toMatchObject({
      title: 'Workspace',
      backTo: '/dashboard',
    });
  });

  it('keeps unexpected failures recoverable without exposing their internal message', () => {
    const surface = resolveUserAreaSurface('/dashboard');
    const descriptor = describeUserAreaRouteError(new Error('postgresql://secret-host/internal'), surface);

    expect(descriptor).toEqual({
      title: 'Dashboard could not load',
      description:
        'The latest request failed, so this page is hidden to avoid showing incomplete data. No data was changed.',
      retryable: true,
      tone: 'error',
      signInRequired: false,
    });
    expect(JSON.stringify(descriptor)).not.toContain('secret-host');
  });

  it('distinguishes authentication, authorization, missing resources and rate limits', () => {
    const surface = resolveUserAreaSurface('/projects/project-1/settings');

    expect(describeUserAreaRouteError(new Response(null, { status: 401 }), surface)).toMatchObject({
      title: 'Sign in required',
      retryable: false,
      signInRequired: true,
    });
    expect(describeUserAreaRouteError(new Response(null, { status: 403 }), surface)).toMatchObject({
      title: 'Access restricted',
      retryable: false,
      tone: 'warning',
    });
    expect(describeUserAreaRouteError(new Response(null, { status: 404 }), surface)).toMatchObject({
      title: 'Project settings was not found',
      retryable: false,
    });
    expect(describeUserAreaRouteError(new Response(null, { status: 429 }), surface)).toMatchObject({
      title: 'Project settings is temporarily limited',
      retryable: true,
    });
  });

  it('localizes surface names and safe error copy in French', () => {
    const surface = resolveUserAreaSurface('/projects/project-1/deployments', frenchTranslate);
    const descriptor = describeUserAreaRouteError(new Response(null, { status: 429 }), surface, frenchTranslate);

    expect(surface).toMatchObject({
      title: 'Déploiements du projet',
      description: 'Les déploiements du projet sont temporairement indisponibles.',
      backLabel: 'Voir les projets',
    });
    expect(descriptor).toMatchObject({
      title: 'Accès temporairement limité : Déploiements du projet',
      description: 'Trop de requêtes ont été envoyées en peu de temps. Patientez un instant, puis réessayez.',
    });
  });
});
