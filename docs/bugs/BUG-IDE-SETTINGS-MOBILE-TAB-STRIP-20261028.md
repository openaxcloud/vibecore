---
id: BUG-IDE-SETTINGS-MOBILE-TAB-STRIP-20261028
---

## Bug

La classe de conteneur ajoutée aux sous-pages Settings active une règle desktop sur la navigation mobile : les sept onglets s’empilent sur 346 px au lieu d’une bande horizontale compacte.

## 📤 Dispatché

☑ 28/10/2026 — régression détectée par la CI de #838, tête `20e0860d0`.

## 💻 Codé

☐ main — correctif local d’un sélecteur ; aucune fusion ni livraison.

## ✅ Testé live

☐ production — six recettes Chromium du build final réussies, données synthétiques ; aucune opération de compte réelle.

## Preuve et cause

Run `40777273810`, tranche 2 `123129906452` : `ide-mobile-chrome.spec.ts:678` mesure 346 px à chaque tentative, pour un seuil existant de 60 px. L’agrégateur échoue avec un échec non dérogé et deux reprises distinctes (Terminal et Search). Aucun seuil ni assertion changé.

Dans `ProjectSettingsPanel.module.scss`, la règle de conteneur `.panel.panel .bolt-project-settings-sidebar` possède trois classes de spécificité. Elle impose grid/static et écrase la règle mobile flex/sticky à deux classes. Limiter ce seul sélecteur à l’ancêtre `.bolt-responsive-ide-desktop` préserve l’adaptation à la largeur réelle du panneau desktop et les styles mobiles existants.

Contre-preuve sur la vraie page compilée : 390 px, hauteur 346→58 px après modification DOM temporaire de ce sélecteur ; sept boutons de 44 px. À desktop1280, panneau de 587,66 px, le comportement grid/static et les mesures restent identiques. Cette contre-preuve DOM n’est pas une validation du build final.

## Validation et limites

72 tests CSS/Memory existants passent après le changement de sélecteur. Le test E2E existant de bande compacte est conservé intégralement. Reçus et captures de session : `/workspace/ui838-settings-sidebar-diagnostic`.

Aucune sauvegarde de compte, modification de quota ou opération financière. Pas de validation sur appareil physique revendiquée.

## Contre-preuve compilée finale

[Six recettes sans override CSS](ui-settings-mobile-strip-evidence-20261028/README.md) passent à320/390/768/820/1280/1920. Bande58px sur téléphone,88,25px sur tablette ; desktop étroit static/grid et grand panneau sticky préservés. Zéro erreur JavaScript. Les valeurs before0 de certaines captures sont préhydratation et ne sont pas utilisées comme preuve avant correctif. Revue indépendante favorable.
