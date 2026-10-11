---
id: BUG-QA-REM-BASE-12-14PX-001
---

## Bug

**CAUSE RACINE des cibles tactiles — la base `rem` est redéfinie à 12 px (desktop) et 14 px (≤1024 px), donc toute classe écrite en supposant `rem = 16 px` rend à 75 % ou 87,5 %.** Vérifié dans `app/styles/index.scss` : `:root { --vc-type-interface-size: 12px }` (**ligne 738**) puis `@media (max-width: 1024px) { :root { --vc-type-interface-size: 14px } }` (**ligne 808**). Le commentaire du bloc l'énonce lui-même : « *`--vc-type-interface-size` is the `html,body` rem base* ». Conséquence arithmétique : une classe visant **48 px** rend **36 px** en desktop et **42 px** en mobile ; une classe visant **44 px** rend **33 px** / **38,5 px**. Cela reproduit exactement les hauteurs mesurées (42, 39, 38). **⚠️ POINT IMPORTANT — corriger la base rem est NÉCESSAIRE mais PAS SUFFISANT.** J'ai rétro-calculé la hauteur *voulue* de chaque cible relevée (mesure ÷ 0,875). Deux familles se dégagent : **(a) Expliquées par la base rem — se répareront seules** : les contrôles à **42 px** (classe pour 48 px) — les 4 champs de `/register`, `Créer le compte`, `Envoyer le lien` de `/forgot-password`, les contrôles de formulaire des panneaux IDE (308×42) ; et ceux à **38–39 px** (classe pour 44 px) — boutons OAuth de `/register`, `Afficher le mot de passe` (39×39), `Choisir Starter/Core/Pro` de `/plan-comparison`, actions rapides de l'IDE (181×38). **(b) NON expliquées — classes déjà écrites SOUS 44 px, elles resteront non conformes après correction de la base.** Rétro-calcul : ces contrôles visent **40 px**, pas 44. Les corriger demande de changer la classe, pas seulement la base : `/templates` — **6× `Utiliser le modèle` 143×36** (action principale de la page) ; `/billing` — `Enregistrer la limite` 156×36, `Bloquer les IA externes` 180×36, `Passer à la formule Pro` 178×36, `Passer à la formule Équipe` 200×36, `Ouvrir le portail client` 169×36 ; `/upgrade` — `Contacter l'équipe commerciale` 295×36, `Formule actuelle` 295×36, et surtout **`Choisir la formule Pro` / `Choisir la formule Team` à 295×34** (les plus basses) ; `/explore` — les 5 filtres de catégorie à 36 px (`Tous` 64×36, `Mobile` 91×36, `API et services applicatifs` 216×36, `IA et machine learning` 194×36, `Applications web` 167×36) ; **IDE mobile** — les 4 boutons du chrome permanent à **36×36** (`Retour au tableau de bord`, `Activité`, `Ouvrir les outils`, `Plus d'options`), présents sur **tous** les panneaux. **(c) Hors périmètre de la cause** : les liens en flux de texte à 18–27 px (`Connectez-vous` 104×18, `Politique de confidentialité` 168×18, `Retour à la connexion` 140×18, `Retour à l'accueil` 138×27) — hauteur dictée par l'interligne, comportement web standard ; et le champ de recherche de l'IDE mobile **202×20**, le plus bas de tous. **(d) Un seul cas vraiment inexpliqué** : un `INPUT` de **13×16 px** sur la fiche `/gallery/<slug>` — probablement une case à cocher native non stylée. À regarder séparément.

## 📤

☐

## 💻

☐

## ✅

✅ **30/08** cause vérifiée dans le code + rétro-calcul sur l'ensemble des relevés

## Preuve

**Cause transmise par Avi le 30/08 et confirmée par lecture de `index.scss:738` et `:808`.** Rétro-calcul appliqué aux ~32 contrôles relevés lors des campagnes des 27, 28 et 30/08 (`/tmp/qa-sweep/mob/tap44.log`, `focus.log`, `portes.log`, `public-art/results.json`). **Ordre de correction recommandé** : (1) rétablir une base `rem` de 16 px et exprimer la réduction typographique par des tokens de `font-size`, ce qui répare la famille (a) d'un coup ; (2) reprendre les classes de la famille (b), écrites pour 40 px, et les porter à 44 px minimum ; (3) traiter le champ de recherche IDE (202×20) et la case `/gallery` séparément. ⚠️ **Les entrées `BUG-QA-TAP-TARGETS-APP-001`, `BUG-QA-TAP-TARGETS-IDE-MOBILE-001` et `BUG-QA-TAP-TARGETS-MARKETING-001` ne sont plus à traiter comme des défauts indépendants** : elles fournissent les mesures, cette entrée fournit la cause et le tri.

