import { apiRequest, json, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * BUG-RUNTIME-DIVERGENCE (option A, signal 3) — passerelle vers l'empreinte des
 * fichiers persistés.
 *
 * Le client visait d'abord `/api/projects/:id/files/revision`. C'était une
 * erreur : la route splat `api.projects.$id.files.$` capture ce chemin et
 * interprète « revision » comme un NOM DE FICHIER, d'où un 404
 * `PROJECT_FILE_NOT_FOUND`. La révision revenait donc toujours `undefined` et le
 * signal 3 n'était pas câblé du tout — vérifié en réel avant correction.
 *
 * Le point d'entrée vit donc hors de l'espace `files/` : un projet a parfaitement
 * le droit d'avoir un fichier nommé `revision`, et une route `files/revision`
 * l'aurait masqué.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.id;

  if (!projectId) {
    throw remainingApiErrorResponse(request, 'PROJECT_NOT_FOUND', 404, { extra: { ok: false } });
  }

  try {
    const payload = await apiRequest<{ revision?: string }>(
      request,
      `/projects/${encodeURIComponent(projectId)}/files/revision`,
    );

    return json({ ok: true, revision: payload.revision }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    /*
     * Jamais d'erreur dure : l'appelant traite `revision: undefined` comme
     * « inconnu » et retombe sur le comportement antérieur (reseed). Faire
     * échouer la réouverture pour une empreinte manquante serait pire que le
     * défaut qu'on corrige.
     */
    return json({ ok: false }, { status: 200, headers: { 'cache-control': 'no-store' } });
  }
}
