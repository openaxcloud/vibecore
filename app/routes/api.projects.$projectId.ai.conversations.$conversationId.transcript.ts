import { apiRequest, json, type EnterpriseActionArgs, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { remainingApiErrorResponse } from '~/lib/i18n/catalogs/remaining-api-routes';

/*
 * BUG-AGENT-CONV-003 — un GET sur cette route rendait `{"message":"Unexpected
 * Server Error"}`, une erreur opaque qui n'appartient à aucune ligne de ce
 * dépôt.
 *
 * D'OÙ ELLE VENAIT, tracé dans le framework installé : sans `loader`,
 * React Router lève lui-même un 400 (« You made a GET request … but did not
 * provide a `loader` »), puis `sanitizeError` du runtime serveur REMPLACE
 * l'erreur par `new Error('Unexpected Server Error')` hors mode développement.
 * Le message ne dit donc rien du défaut, et sa recherche dans le code ne rend
 * rien — c'est ce qui a fait tourner ce point en rond.
 *
 * CE QUE LE CORRECTIF N'EST PAS. Il ne s'agit PAS d'ajouter un `loader` qui
 * relaie un GET vers le serveur : ce dernier n'expose que
 * `PUT /projects/:id/ai/conversations/:cid/transcript` — il n'y a AUCUN GET à
 * relayer, et aucun client ne le lit (la lecture du fil passe par `/messages`).
 * Router vers un endpoint inexistant serait le correctif qui « route vers un
 * panneau vide » de la règle 10.
 *
 * Ce que fait ce `loader` : dire à GET et HEAD ce que l'`action` dit DÉJÀ à
 * POST, DELETE et PATCH — 405, avec le code et l'en-tête `Allow`. L'intention
 * était écrite dans le fichier ; elle était simplement défaite pour exactement
 * les deux méthodes que React Router route vers `loader`.
 */
export async function loader({ request, params }: EnterpriseLoaderArgs) {
  if (!params.projectId || !params.conversationId) {
    return remainingApiErrorResponse(request, 'CONVERSATION_NOT_FOUND', 404, { extra: { ok: false } });
  }

  return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, {
    extra: { ok: false },
    headers: { Allow: 'PUT' },
  });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  if (!params.projectId || !params.conversationId) {
    return remainingApiErrorResponse(request, 'CONVERSATION_NOT_FOUND', 404, { extra: { ok: false } });
  }

  if (request.method.toUpperCase() !== 'PUT') {
    /* Le même en-tête que le `loader` : un 405 sans `Allow` laisse deviner. */
    return remainingApiErrorResponse(request, 'METHOD_NOT_ALLOWED', 405, {
      extra: { ok: false },
      headers: { Allow: 'PUT' },
    });
  }

  const body = await request.text();

  const payload = await apiRequest(
    request,
    `/projects/${encodeURIComponent(params.projectId)}/ai/conversations/${encodeURIComponent(
      params.conversationId,
    )}/transcript`,
    {
      method: 'PUT',
      body,
    },
  );

  return json(payload);
}
