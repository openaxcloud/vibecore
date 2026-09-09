import { formatApiRuntimeRoutesCopy, getApiRuntimeRoutesCopy } from '~/lib/i18n/catalogs/api-runtime-routes';

/**
 * BUG-IDE-005 — dire POURQUOI l'installation a échoué, pas seulement qu'elle a
 * échoué.
 *
 * La sortie de la commande porte la vraie cause (paquet introuvable, registre
 * injoignable, conflit de versions). On en rend la FIN : c'est là que les
 * gestionnaires de paquets écrivent leur diagnostic, alors que le début n'est
 * que du bruit de résolution.
 *
 * Bornée à 400 caractères — un message d'interface, pas un journal ; la sortie
 * complète reste dans l'historique des runs, écrit juste avant le refus.
 *
 * ⚠️ Hors du module de route, pour la même raison que
 * `panneau-stockage-objets.ts` : React Router refuse un export de route qui
 * dépend de code serveur.
 */
export function messageDEchecDInstallation(
  run: { exitCode?: number; output?: string },
  language?: string | null,
): string {
  const copy = getApiRuntimeRoutesCopy(language);
  const code = String(run.exitCode ?? 1);

  const fin = (run.output ?? '')
    .split(/\r?\n/u)
    .map((ligne) => ligne.trim())
    .filter(Boolean)
    .slice(-4)
    .join(' · ')
    .slice(-400);

  if (!fin) {
    return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.packageRunFailed'], { code });
  }

  return formatApiRuntimeRoutesCopy(copy['apiRuntime.panel.packageRunFailedWithOutput'], { code, output: fin });
}
