---
id: BUG-IDE-STYLE-DETACHED-MENU-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

P2 — Le test historique « IDE applies section 12 UI detail styles » peut mesurer le menu de la coque de chargement après son remplacement par React. `Locator.evaluate` résout d'abord un handle, puis exécute son callback ; le nœud peut être détaché entre ces opérations. `getComputedStyle` renvoie alors des valeurs vides, même si la palette courante reste visible avec les styles attendus.

Six observations locales sur le build `93e7e3d8e` et les tests de `0b8ae254f` conservent les assertions et délais historiques. Les trois échecs constatent simultanément un ancien nœud déconnecté, un rayon vide et un menu courant connecté à `12px`. Les trois succès mesurent le même nœud connecté à `12px`. Cette preuve attribue ces échecs **locaux** ; elle n'attribue pas les échecs historiques CI, dont les captures n'ont pas été obtenues. Elle ne clôt pas le diagnostic du panneau base de données.

## 📤 Dispatché

📤 Pris en charge le 18/10/2026, après contre-observation locale de l'ancien et du nouveau nœud dans le même callback navigateur.

## 💻 Codé

☐ Correctif de test local ; pas encore fusionné sur main.

`tests/e2e/helpers/ide-ui-detail-styles.ts` choisit le menu courant et lit tous les styles dans un seul callback synchrone de `page.evaluate`. L'absence de menu provoque une erreur immédiate. Le test historique appelle ce lecteur ; son helper d'ouverture, ses assertions, délais, retries et exemptions restent inchangés. Aucune source produit ni CSS modifiée.

Le scénario réel de handoff conserve un handle avant de libérer une vraie réponse HTTP `ide-state` inchangée. Il exige ensuite l'ancien menu déconnecté et le nouveau connecté, puis vérifie le lecteur atomique. Une mutation CSS locale à `13px`, restaurée dans un `finally`, doit être lue exactement à `13px` : le lecteur ne masque pas cette erreur par la valeur `12px` exigée par l'assertion historique inchangée. Après Escape, le lecteur doit rejeter l'absence de menu. Le scénario conserve ses vérifications de fermeture, recherche et navigation, ainsi que sa borne existante de 120 s.

## ✅ Testé live

☐ Aucun déploiement ni contrôle en production. Le lot local `6365455b6` passe ses deux cas Chromium sans retry (49,4 s), y compris styles `13px`/`12px`, ancien nœud détaché et menu absent. Les trois projets QA ont reçu DELETE 200 ; nettoyage et wrapper terminent avec code 0. [Preuve intégrée](../reprise/mesures/2026-10-18-ide-recovery-integrated.json).

## Preuve

- [Métadonnées des six observations locales](../reprise/mesures/2026-10-18-style-detached-local.json) : trois échecs et trois succès, un worker, zéro retry, réponses HTTP réelles. Les six projets QA ont reçu DELETE 200.
- [Capture locale de la palette visible après l'échec](../reprise/captures/2026-10-18-style-detached-palette-visible.png). La capture seule ne prouve pas l'état au moment de la mesure ; les métadonnées synchrones le prouvent.
- L'empreinte SHA-256 du bloc d'assertions historique est conservée : `6aaf9be84a37a485b6f925f51bd31e9a3f8f49bcdfce2604d57e13d20d43e3cb`.
- La nouvelle régression n'utilise ni faux contenu HTTP ni fixture JSX. Le contre-cas CSS modifie uniquement le DOM local de cette identité QA jetable.
- Typage ciblé des trois fichiers de test/helper avec TypeScript 5.8.3 du dépôt : code 0, zéro diagnostic. ESLint : zéro diagnostic pour le helper et le scénario handoff ; le fichier dashboard conserve ses six erreurs et un avertissement historiques, sans ajout. Il ne s'agit pas d'un lint global propre.

Limites : preuve Chromium locale ; aucune attribution nouvelle de CI, aucune preuve Safari, mobile ou production. Aucun build produit nécessaire pour cette correction exclusivement dans les tests ; le navigateur a utilisé le même build produit que les observations, avec entrées comparées octet pour octet.
