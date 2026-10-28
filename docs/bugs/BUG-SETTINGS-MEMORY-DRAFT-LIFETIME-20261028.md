---
id: BUG-SETTINGS-MEMORY-DRAFT-LIFETIME-20261028
---

## Bug

Le panneau Settings perd l’onglet Memory et son brouillon lorsque la coque responsive est remplacée. Reproduction navigateur locale sur la base 9ec6ebf75 : après 60 frames, les transitions 320→1280, 390→1280 et 1280→768 détachent le textarea, rétablissent l’onglet Projet et perdent le texte (3/3). Les réponses API de recette sont synthétiques ; aucune mémoire cliente n’a été modifiée.

## 📤 Dispatché

☑ 28/10/2026 — lot isolé Settings/Memory, distinct du premier lot Search/FileTree/Terminal.

## 💻 Codé

☐ main — correctif local préparé et revu ; ni fusionné ni déployé. L’onglet et les brouillons, résultats et états de requête Memory appartiennent à la route, isolés par projet/fenêtre. Aucun secret, formulaire compte ou brouillon Git déplacé ; aucun stockage permanent.

## ✅ Testé live

☐ production — aucune recette production. La recette navigateur après correctif est encore attendue ; la reproduction navigateur ci-dessus concerne seulement la version initiale.

## Correction et validations locales

- Provider sous le scope projet/fenêtre existant, conservé lors du remplacement de coque et supprimé à la sortie de route.
- Opérations Memory existantes extraites sans changer leurs routes ou payloads ; verrou synchrone pendant lecture/écriture, signal d’annulation à la sortie du scope. Aucun GET au simple montage de route.
- Brouillons ajout/édition et erreurs conservés ; succès de sauvegarde efface seulement le tuple contenu/type/tags resté inchangé. Les réponses 202 restent signalées non enregistrées.
- Deux témoins initiaux rouges sur cinq (brouillon et chargement perdus). Revue indépendante : helper de tags hors portée dans le rendu et effacement partiel d’un brouillon modifié corrigés après reproduction rouge (un test de rendu, trois tests de tuple).
- 37 tests locaux verts, zéro ignoré : 13 tests du hook, 23 tests palette existants et un rendu du fragment JSX réel de prévisualisation Memory avec ses imports. Tests HTTP différés synthétiques : aucun backend réel contacté.
- Lint ciblé et contrôle du diff verts. Typage global passé avant les corrections de revue ; typage web repassé après ces corrections. BaseChat conserve son @ts-nocheck préexistant : le témoin de rendu, et non le typage seul, prouve la résolution du helper manquant.
- Revue indépendante favorable après corrections. Build intégré, recette navigateur après correction, contrôles CI, fusion et livraison restent à exécuter.

## Limites

Le brouillon général Projet et les formulaires compte/sécurité ne sont pas partagés. Ce lot ne certifie ni leur conservation ni le focus après un changement de coque. Aucun seuil, assertion ou contrôle de CI n’a été diminué. Aucune action sur les données de production.
