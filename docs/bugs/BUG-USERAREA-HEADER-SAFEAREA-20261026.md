---
id: BUG-USERAREA-HEADER-SAFEAREA-20261026
---

## Bug

Header de la zone utilisateur : contrôles dans les marges sûres simulées portrait et paysage.

Huit simulations CDP sur Security/Switcher :320×900,390×844,844×390,820×1180, FR clair. Insets calculés confirmés : portrait top44/bottom34 ; paysage left/right47/bottom21. Les boutons du header restent y5,5→49,5 malgré une zone sûre commençant à44 ; paysage Menu x21→65 et Notifications x779→823 franchissent les limites47→797. Ce constat est simulé, pas une recette iOS physique.

## 📤 Dispatché

☑ 26/10/2026 — Mission UI globale, lot local isolé ; périmètre revu avec le parent.

## 💻 Codé

☐ Sur main. Correctif local uniquement ; aucune fusion ni livraison déclarée par cette fiche.

Seule classe TopBar ajustée : hauteur56px+inset supérieur, padding supérieur correspondant, marges latérales max(marge existante,inset), avec variante sm. Sticky/ancêtres/nav inchangés. Source locale appliquée ; génération UnoCSS indépendante vérifiée. Aucun ajout de navigation basse inclus ; le scroll body Security est corrigé séparément, voir Validation locale.

## ✅ Testé live

☐ En production. Chromium local et données synthétiques uniquement ; aucune authentification production, mutation réelle, achat ou nouvel accès.

## Validation locale

31 tests existants et lint ciblé verts. Recette compilée10999, sans correction CSS injectée :8 simulations CDP FR clair Security/Switcher sur quatre formats, header dans les zones sûres, contrôles≥44px.32 observations sans inset sur huit formats ×FR/EN ×clair/sombre : hauteur56px, padding supérieur0, contrôles contenus ;16 ouvertures/fermetures de menu avec Escape et restitution du focus. [Preuves compilées10999](ui-coverage-2026-10-26/safeareas/after10999/README.md).

Complément11099 FR clair844×390 : header reste contenu après défilement, dialogue Switcher contenu et Escape rend le focus. Security retrouve le scroll utilisateur après le correctif séparé du verrou, mais son champ reste x43 pour une marge sûre47. [Complément11099](ui-coverage-2026-10-26/safeareas/after11099/README.md). Pas de replay des8+32 sur11099 ni de matériel réel ; absence préexistante de navigation basse AppShell et demande globale toujours ouvertes.

## Preuves et limites

[Simulation, défauts, contrepreuves et limites](ui-coverage-2026-10-26/safeareas/README.md), [revue du calcul CSS](ui-coverage-2026-10-26/README.md). Le scroll Security est rétabli11099 ; sa limite horizontale et l’absence de navigation basse AppShell restent ouvertes, sans promesse de fin globale.

Pas de certification globale des routes/états, Safari/Firefox, clavier virtuel physique ou safe areas matérielles. Les comptes de cas partagés ne s’additionnent pas entre fiches.
