---
id: BUG-MARKETING-DEPLOYMENTS-HERO-WIDTH-20261026
---

## Bug

Sur `/marketing/deployments`, les trois cartes Hero restent sur trois colonnes dans un demi-conteneur à1024px : carte146,9px, titre97px, mots chevauchant la carte voisine. À320FR, le CTA documentation nowrap impose aussi une largeur369,8px masquée par overflow-hidden.

## 📤 Dispatché

☑ 26/10/2026 — Audit Solutions/présentations produit, cause reproduite et proposition minimale revue par le parent.32PR ouvertes inspectées sans chevauchement du fichier concerné.

## 💻 Codé

☐ Sur main. Deux classes locales corrigées dans `PublicDeploymentsPage.tsx` : grille auto-fit avec minimum14rem borné100%, CTA documentation multiline de hauteur automatique et minimum44px. Texte, trois cartes, typographie, liens et actions conservés. Aucune modification du moteur de déploiement.

## ✅ Testé live

☐ En production. Chromium local, aucune donnée réelle, mutation, publication ou backend externe. Aucun build corrigé encore testé.

## Validation locale et preuves

[Archive](ui-solutions-product-2026-10-26/README.md) : baseline1276observations/30IDs partiellement exercés,8observations de contrats et32groupes représentatifs. Ce ne sont pas1276tests ni30pages indépendantes. Défaut interne confirmé malgré document contenu.

Contrepreuve DOM minimale12cas FR/EN clair à320/768/1024/1280/1440/1920 : textes/typo conservés, titres dans les cartes et viewport.320FR grille369,8→272px ;1024 cartes146,9→232,4px.11tests existants, lint et formatage ciblés passent. Pas de nouvelle suite miroir CSS.

Build et recette compilée du delta attendus dans le lot parent, avec mesures CTA/texte/hauteur et grille ; pas de certification responsive globale, Safari, zoom, safeareas ou contraste. Main/live restent faux.

## Complément compilé13799 — défaut encore ouvert

[Échec conservé](ui-solutions-product-2026-10-26/after13799/README.md) : après3observations et1groupe, CTA22px à844. Cause md:min-h-0 du Button partagé. Contrepreuve DOM8cas stabilisés22→44 ; correction supplémentaire strictement locale !min-h-[44px] autorisée et appliquée, non recompilée ici. Le plan44observations/8groupes n’est pas déclaré exécuté entièrement.
