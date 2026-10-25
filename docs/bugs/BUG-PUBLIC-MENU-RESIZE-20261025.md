---
id: BUG-PUBLIC-MENU-RESIZE-20261025
---

## Bug

Dans le chrome public Accueil/Tarifs, le bouton de menu déborde à320px (bord droit351,8px alors que le document reste à320px). Échap ferme le dialogue sans restaurer le focus sur son ouvreur. Ouvrir le menu mobile puis passer à1440px masque le dialogue par CSS mais conserve son état ouvert, `pointer-events:none`, le verrouillage du scroll et `aria-hidden` : le bureau reste inutilisable jusqu’à Échap.

## 📤 Dispatché

Audit global UI/UX du25octobre2026, parcours publics isolés après la publication de #792. Les29PR ouvertes ont été inspectées : aucune ne touche `EcodeExactShell.tsx`. Le chrome public est distinct de la navigation IDE #788. Aucun retry d’opération refusée #768/#764.

## 💻 Codé

Correctif local dans un worktree séparé : header mobile repliable, focus restauré et dialogue fermé au seuil desktop1280px. La carte Comparaisons du footer utilise toute la largeur mobile ; la marge logique du header préserve le RTL. Pas sur main. Source #792 figée pendant sa CI. Aucun lien ou parcours retiré pour masquer le défaut.

## ✅ Testé live

Non. Reproduction Chromium locale avec API synthétique ; aucun compte créé, authentification réelle ni mutation externe. Recettes Chromium compilées archivées : géométrie, zoom natif, focus/Échap, changement de breakpoint, RTL et Retour. Elles ne constituent pas une recette production.

## Preuves

Captures, matrices et contre-épreuves archivées dans [public](user-area-secondary-2026-10-25/public/README.md). Le document ne déborde pas lui-même : les contrôles internes doivent être mesurés.
