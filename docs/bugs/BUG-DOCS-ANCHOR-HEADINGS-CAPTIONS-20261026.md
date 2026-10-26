---
id: BUG-DOCS-ANCHOR-HEADINGS-CAPTIONS-20261026
---

## Bug

Guide Docs : titre d’ancre masqué, hiérarchie sans h1 et consigne développeur exposée dans les légendes.

Sur /docs à320, première ancre FR/EN clair/sombre : section y≈24, titre y≈49 sous un header111px. Les16 observations Docs n’ont pas de h1 (premier titre h2, sections h3). Les légendes montrent une instruction demandant de remplacer la maquette par une capture et exposent un chemin /public interne. Les images réelles correspondantes n’étaient pas trouvées au chemin inspecté.

## 📤 Dispatché

☑ 26/10/2026 — Mission UI globale, lot local isolé ; périmètre revu avec le parent.

## 💻 Codé

☐ Sur main. Correctif local uniquement ; aucune fusion ni livraison déclarée par cette fiche.

Delta local limité à AgentWalkthrough.tsx et son catalogue : marge de défilement d’ancre9rem, guide h1 et sections h2 sans changement de taille, légendes honnêtes d’illustrations sans instruction développeur. Les schémas et étapes restent présents ; aucune vraie capture ni validation du moteur n’est inventée. Source appliquée localement ; résultats compilés et delta SSR détaillés dans Validation locale.

## ✅ Testé live

☐ En production. Chromium local et données synthétiques uniquement ; aucune authentification production, mutation réelle, achat ou nouvel accès.

## Validation locale

Après10899 :44 géométries Docs,4 groupes d’interactions et2 zooms natifs200% FR/EN clair, au sein des88/8/4 communs Templates/Docs. Hiérarchie h1/h2 et légendes descriptives correctes ; première ancre clavier sous header. Quatre ouvertures réellement froides échouaient encore, cible absente du HTML initial ; ce rouge est conservé.

Delta SSR local supplémentaire dans docs.tsx : shell SSR existante et handle serverRenderedMarketing, sans changement root. Recette compilée11099 :16 contextes neufs FR/EN ×clair/sombre ×320/1440 ×première/dernière section, chacun avec Accueil→Retour, tous ciblent un titre visible sous header. Deux zooms natifs200% FR/EN clair réussissent. Il s’agit de16 contextes avec Retour, pas32 cas distincts.17 tests Docs/SEO existants et lint ciblé verts ; pas une suite globale.

[Archives10899](ui-coverage-2026-10-26/public-next/README.md), [SSR11099](ui-coverage-2026-10-26/public-next/after11099/README.md). Le diagnostic de mesure immédiate avant rendu est conservé séparément. Toutes les ancres/formats et les fonctions illustrées ne sont pas validés ; aucun lecteur d’écran réel.

## Preuves et limites

[Synthèse et chemins des preuves10799](ui-coverage-2026-10-26/README.md). [Archives durables avant/après](ui-coverage-2026-10-26/public-next/README.md) conservent les reçus, captures et contrepreuves.

Pas de certification globale des routes/états, Safari/Firefox, clavier virtuel physique ou safe areas matérielles. Les comptes de cas partagés ne s’additionnent pas entre fiches.
