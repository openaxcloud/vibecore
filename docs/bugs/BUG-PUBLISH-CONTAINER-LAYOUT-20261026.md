# Publish : contenu décalé et coupé entre les panneaux latéraux

📤 Dispatché : ☑ 26/10/2026 — captures utilisateur 11:41–11:43, lot Publish/Domains/Manage distinct de #808 et de la palette #768.
💻 Codé : ☐ — correctif local validé, revue indépendante favorable ; aucune livraison de ce lot.
✅ Testé live : ☐ — aucune recette authentifiée de production, modification DNS ou publication cliente.

## Signal et cause à vérifier

À viewport 2048 px avec Agent environ 480 px et Library environ 380 px, les onglets Publish laissent un grand vide et le contenu Domains dépasse à droite. Manage place son formulaire à côté des onglets et les autres fournisseurs en dessous à gauche. La grille `.bolt-project-deploy-tool` conserve deux colonnes malgré son nouveau contenu séquentiel : navigation, vue active, formulaire et options avancées.

## Critères

Reproduire sur DOM réel avec des conteneurs 320–1200 px, y compris deux sidebars et zoom navigateur 200 %. Onglets puis contenu dans l’ordre, aucune carte/formulaire/DNS coupé, défilement vertical et clavier utilisables. Préserver fonctions, routes, liens, backend Domains et mobile. Tests isolés, aucune écriture fournisseur/client.

## Captures sources

Library : libfile_37585de2a08881919426ec7eb7587182, libfile_01744b5e90a08191af7852c973b3a3f1, libfile_ad80a308cd608191a29b680e32bc3e07. Références résolues ; téléchargement par le helper Library en erreur technique `download failed`, inspection des pixels non effectuée à ce stade. La description du parent est une preuve rapportée, distincte de la reproduction locale.

## Validation locale finale

Grille Publish sur une colonne ; repli selon largeur du conteneur, hostname et valeurs DNS longs lisibles. Le seul changement produit est le bloc SCSS Deploy (64 ajouts/1 suppression). 76 tests CSS,16 tests index, lint, typecheck web et build passent.12 scénarios navigateur qualifiés :8 à viewport2560 (conteneurs320–1200 et historique vide),2 zoom natif200%,1 viewport2048 clair et1 sombre. Les10 premiers passent directement sur le build final ; les2 à2048 passent après corrections documentées du harnais. À2048, largeur centrale réelle1089px avec Agent480/Library380, aucune occlusion ni débordement horizontal. Voir [preuves et limites](publish-container-layout-2026-10-26/qa/README.md).

Le rouge causal réintroduit uniquement la grille deux colonnes sur le vrai DOM : ce n’est pas une recette complète d’un ancien build. Aucun domaine, DNS ou déploiement fournisseur exécuté. Manage conserve son erreur de détection réelle dans le workspace isolé et son bouton Publish désactivé ; le bon fonctionnement de publication n’est pas déduit de ces tests de layout.

Intégration de main70f40edb8 après fusion #808 : conflit documentaire seul, index524, revue indépendante favorable ;92 tests CSS/index, build, typage et4 scénarios navigateur ciblés réussis directement. CSS identique au build des12 scénarios précédents.
