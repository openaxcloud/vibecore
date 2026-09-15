import { chargerCoquillePublique } from './SaaSLayout';

/**
 * Fait charger la coquille marketing AVANT un rendu synchrone de test.
 *
 * Depuis #541 la coquille est chargée dynamiquement — c'est tout le correctif :
 * sans cela elle voyage dans le chunk racine, donc sur chaque page, IDE compris.
 * `renderToStaticMarkup` est synchrone : sans préchauffage il ne voit que le
 * repli. Un `beforeAll(prechaufferCoquillePublique)` suffit, et aucune assertion
 * du test ne change.
 */
export function prechaufferCoquillePublique(): Promise<void> {
  return chargerCoquillePublique();
}
