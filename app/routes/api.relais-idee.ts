import { apiRequest, json, type EnterpriseActionArgs } from '~/lib/enterprise-api.server';
import { poserLeJetonDuRelais } from '~/lib/relais-idee.server';

/*
 * L'accueil de `e-code.ai` dépose ici l'idée du visiteur AVANT de l'envoyer vers
 * `app.e-code.ai`, une autre origine où son `sessionStorage` ne le suivrait pas
 * (BUG-QA0928-IDEE-PERDUE-INSCRIPTION). L'API garde l'idée ; le navigateur ne
 * reçoit qu'un jeton opaque, dans un cookie de domaine.
 */
export async function action({ request }: EnterpriseActionArgs) {
  if (request.method !== 'POST') {
    return json({ ok: false }, { status: 405 });
  }

  let corps: unknown;

  try {
    corps = await request.json();
  } catch {
    return json({ ok: false }, { status: 400 });
  }

  try {
    const { id } = await apiRequest<{ id: string }>(request, '/idea-relays', {
      method: 'POST',
      redirectOn401: false,
      body: JSON.stringify(corps),
    });

    return json({ ok: true }, { headers: { 'set-cookie': poserLeJetonDuRelais(request, id) } });
  } catch (error) {
    const statut = error instanceof Response ? error.status : 502;

    return json({ ok: false }, { status: statut === 400 || statut === 429 ? statut : 502 });
  }
}
