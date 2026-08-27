/**
 * Message à afficher quand une action de panneau échoue.
 *
 * La route de panneau masque déjà tout ce qui n'est pas montrable : un échec
 * qu'elle n'a pas su qualifier ressort en message générique et localisé. Ce qui
 * arrive ici dans `error` est donc TOUJOURS sûr à afficher — et c'est la seule
 * chose qui nomme la cause.
 *
 * Le client le lisait pour le JOURNALISER, puis le remplaçait par « Échec de
 * l'action du panneau (HTTP 503) ». C'est ce que voyait l'utilisateur en
 * essayant de créer une base de données, alors que le serveur avait pris soin de
 * préserver `DATABASE_PROVISION_UNAVAILABLE` et sa `reason` — un correctif
 * serveur entièrement annulé par le client.
 *
 * `reason` est ajoutée entre parenthèses quand elle existe : c'est elle qui
 * distingue « réessayez » d'un défaut de configuration de la plateforme, et
 * c'est la première chose que demandera le support.
 */
export function panelActionFailureMessage(payload: unknown, fallback: string): { message: string; code?: string } {
  const corps = (payload ?? {}) as { error?: unknown; code?: unknown; reason?: unknown };
  const erreur = typeof corps.error === 'string' ? corps.error.trim() : '';
  const code = typeof corps.code === 'string' && corps.code.trim() ? corps.code.trim() : undefined;

  if (!erreur) {
    return { message: fallback, code };
  }

  const raison = typeof corps.reason === 'string' ? corps.reason.trim() : '';

  return { message: raison ? `${erreur} (${raison})` : erreur, code };
}
