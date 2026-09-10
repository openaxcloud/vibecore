/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * BUG-AUTH-001 — /workspace-settings et /desktop-settings sont les DEUX seules
 * routes de `USER_AREA_ROUTE_PREFIXES` dont le loader ne lit aucune donnée
 * serveur (mesuré : 0 appel `apiRequest`, contre 2 à 12 pour les vingt-sept
 * autres). Elles ne pouvaient donc pas hériter de la redirection que
 * `apiRequest` lève sur un 401 : sans garde explicite, elles rendaient 200 à un
 * visiteur déconnecté.
 *
 * Ce spec épingle la garde SUR LE CHEMIN RÉEL — il appelle les vrais `loader`
 * des deux routes, pas le helper. Un test qui n'exercerait que
 * `requireAuthenticatedUser` resterait vert si quelqu'un retirait son appel du
 * loader, ce qui est exactement le geste qui rouvre la page.
 *
 * `~/lib/enterprise-api.server` est importé EN VRAI, jamais simulé : c'est lui
 * qu'on garde. Seuls les modules de présentation sont neutralisés — ce spec
 * n'affiche aucune page.
 */

vi.mock('~/components/dashboard/SaaSLayout', () => ({
  AppShell: () => null,
  StatGrid: () => null,
}));

vi.mock('~/components/settings/WorkspaceSettings', () => ({
  WorkspaceSettings: () => null,
}));

import { loader as desktopSettingsLoader } from './desktop-settings';
import { loader as workspaceSettingsLoader } from './workspace-settings';

const ROUTES_FERMEES = [
  { chemin: '/workspace-settings', charger: workspaceSettingsLoader },
  { chemin: '/desktop-settings', charger: desktopSettingsLoader },
] as const;

function requete(chemin: string, cookie?: string) {
  return new Request(`https://app.example.com${chemin}`, cookie ? { headers: { cookie } } : undefined);
}

async function jeteParLeLoader(execution: unknown) {
  return Promise.resolve(execution).then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('BUG-AUTH-001 — les deux pages de réglages sans dépendance serveur sont fermées', () => {
  let apiBaseUrlOriginal: string | undefined;

  beforeEach(() => {
    apiBaseUrlOriginal = process.env.API_BASE_URL;
    delete process.env.SAAS_API_URL;
    process.env.API_BASE_URL = 'https://api.example.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();

    if (apiBaseUrlOriginal === undefined) {
      delete process.env.API_BASE_URL;
    } else {
      process.env.API_BASE_URL = apiBaseUrlOriginal;
    }
  });

  for (const { chemin, charger } of ROUTES_FERMEES) {
    it(`${chemin} renvoie un visiteur sans session vers /login`, async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const leve = await jeteParLeLoader(charger({ request: requete(chemin), params: {}, context: {} } as never));

      expect(leve, `${chemin} n’a rien levé : la garde a disparu du loader`).toBeInstanceOf(Response);
      expect((leve as Response).status).toBe(302);
      expect((leve as Response).headers.get('Location')).toBe(`/login?returnTo=${encodeURIComponent(chemin)}`);
      expect(fetchMock, `${chemin} est allé au réseau pour un visiteur sans cookie`).not.toHaveBeenCalled();
    });

    it(`${chemin} reste ouverte à une session valide`, async () => {
      const fetchMock = vi.fn(
        async () =>
          new Response(JSON.stringify({ user: { id: 'u_1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const leve = await jeteParLeLoader(
        charger({ request: requete(chemin, 'vc_session=valide'), params: {}, context: {} } as never),
      );

      /*
       * L'autre moitié (règle 6) : sans elle, durcir la garde en redirection
       * INCONDITIONNELLE passerait le premier cas au vert tout en fermant la
       * page à ceux qui y ont droit.
       */
      expect(leve, `${chemin} ferme la page à un utilisateur CONNECTÉ`).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/auth/me', expect.anything());
    });
  }
});
