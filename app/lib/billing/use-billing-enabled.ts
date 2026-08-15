import { useRouteLoaderData } from 'react-router';

/*
 * KILL-SWITCH FACTURATION — lecture CLIENT, fail-closed elle aussi.
 *
 * Le drapeau est résolu côté serveur (le navigateur n'a pas accès aux variables
 * d'environnement, et un drapeau que le client déciderait lui-même serait un
 * drapeau qu'on peut retourner depuis la console). Il descend par le loader
 * racine, seule voie qui le rende disponible à TOUTE l'application sans que
 * chaque surface refasse sa propre lecture — et se trompe.
 *
 * Le défaut reste NON : loader pas encore hydraté, donnée absente, valeur d'un
 * autre type — dans tous ces cas on masque. Afficher un bouton « Passer au
 * plan supérieur » pendant une fraction de seconde d'hydratation serait un
 * défaut visible par l'utilisateur ; ne rien afficher ne l'est pas.
 */

/** Forme minimale attendue du loader racine. */
interface RootLoaderShape {
  billingEnabled?: unknown;
}

/**
 * La facturation est-elle activée pour cette session ?
 *
 * À `false` — le cas du lancement gratuit — aucune surface de facturation ne
 * doit être rendue : ni navigation, ni bouton, ni bannière, ni paywall.
 */
export function useBillingEnabled(): boolean {
  const root = useRouteLoaderData('root') as RootLoaderShape | undefined;

  return root?.billingEnabled === true;
}
