/*
 * BUG-QA0930-INVITATION-SANS-PLACE — l'API refuse une invitation (ou son
 * acceptation) quand le forfait de l'équipe n'a plus de place : HTTP 429 avec le
 * code `QUOTA_EXCEEDED`. Le même statut sert aussi au limiteur de débit ; les
 * formulaires d'invitation le lisaient tous comme « trop de tentatives,
 * réessayez » — or réessayer ne libère aucune place.
 *
 * Seul le CODE distingue les deux refus : c'est lui qu'on lit, jamais le statut seul.
 */
export async function estUnRefusFauteDePlace(error: unknown): Promise<boolean> {
  if (!(error instanceof Response) || error.status !== 429) {
    return false;
  }

  const corps = (await error
    .clone()
    .json()
    .catch(() => null)) as { code?: string } | null;

  return corps?.code === 'QUOTA_EXCEEDED';
}
