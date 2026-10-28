---
id: BUG-IDE-SETTINGS-NONSENSITIVE-DRAFT-20261028
---

## Bug

Les brouillons non sensibles Compte/Préférences disparaissent au changement de sous-page ou de coque. Défaut reproduit en navigateur local avec données synthétiques.

## 📤 Dispatché

☑ 28/10/2026 — complément Settings après intégration locale de #835, distinct des secrets et des opérations backend.

## 💻 Codé

☐ main — correction locale revue et validée dans l’assemblage ; pas de fusion ni déploiement.

## ✅ Testé live

☐ production — six recettes Chromium locales réussies, données synthétiques et aucune soumission backend. Build commun52670 et typage42945 réussis.

## Symptôme et preuves initiales

Recette sur `e71e328ed`, build Problems66352 : quatre cas FR/EN × viewport1280×900/1920×900, chacun redimensionné vers390×900 puis retour. Saisir un nom Compte non enregistré, ouvrir Préférences puis revenir rétablit le nom API. Saisir77 dans le seuil Préférences, changer de sous-page puis revenir rétablit80. La sous-page revenait à Projet après resize dans cette ancienne base. Zéro erreur navigateur dans ces quatre cas.

Preuves de session : `/workspace/ui-settings-followup-audit/{fr,en}/receipt.json`, captures correspondantes et `README.md`. Les requêtes externes et mutations, y compris tentatives automatiques de sauvegarde de disposition, étaient bloquées. Aucun formulaire soumis, aucun secret saisi, aucune donnée cliente consultée.

Nuance après intégration : #835 conserve déjà la sous-page et les brouillons Memory à travers les coquilles. Ce complément ne réimplémente pas ce comportement ni ne change son scope. Il traite les champs Compte/Préférences restés non contrôlés.

## Correction ciblée

Le provider existant reçoit un dictionnaire éphémère de brouillons non sensibles, avec isolation par paneId réel au sein du scope projet/fenêtre existant. Le paneId est transmis depuis le rendu desktop et activePaneId mobile, sans changer la navigation. Les appelants historiques sans paneId conservent un état local.

Liste autorisée : nom/email du profil, thème, mode clavier, seuil d'alerte et raccourcis. Aucun mot de passe, clé API, confirmation sensible ou stockage navigateur durable. Les opérations Memory, formulaires backend et contrats de soumission restent inchangés.

Une valeur serveur fraîche remplace un champ inchangé ou confirme une valeur identique au brouillon. Un champ sale résiste à une valeur serveur divergente. Les événements globaux `vibecore:ide-panel-action`, non corrélés à une requête/panneau, ne purgent aucun brouillon. Une soumission annulée conserve la saisie.

La classe de conteneur Settings est appliquée à toutes les sous-pages pour le correctif CSS du propriétaire du lot sidebar ; ce défaut visuel est documenté séparément.

## Validation locale

- Témoin rouge : les véritables formulaires extraits de BaseChat dans HEAD avant correction perdent le nom après changement de sous-page (`/tmp/settings-controls-red.log`).
- Vert : 26 tests dans quatre suites, dont13 tests Memory existants,10 tests nouveaux de scope/réconciliation,1 test des véritables contrôles et2 tests Memory preview (`/tmp/settings-draft-final-tests.log`).
- Cas couverts : remount, disparition/retour de sous-page, deux panneaux distincts, projet/fenêtre différents, fallback local, données fraîches contre dirty, confirmation puis mise à jour ultérieure, soumission empêchée, événements globaux succès/échec ignorés ; email/thème/mode clavier/raccourci testés explicitement.
- Revue indépendante du hook et du raccord favorable ; pas de preuve production ou de sauvegarde backend réelle revendiquée.

## Contrepreuve compilée finale

Preuves archivées : [matrice, reçus et captures](settings-form-draft-evidence-20261028/README.md), avec empreintes du build et des sources gelées. Six recettes réussies, zéro erreur navigateur :

- FR et EN, chacun à1280×900 et1920×900 : nom Compte non enregistré et seuil Préférences77 conservés après changement de sous-page, redimensionnement vers390×900 puis retour. La sous-page reste Préférences et le nom Compte est encore présent après le retour.
- FR au zoom navigateur natif200%, fenêtre2560×1800 donnant CSS1280×856 : valeurs conservées entre sous-pages et thème accessible dans le panneau de588px. Cette recette n’ajoute pas de redimensionnement ; elle ne simule pas le zoom par DPR/CSS.
- FR1920, deux panneaux Settings ouverts par split puis ajout d’onglet natifs : deux noms distincts et seuils77/80 restent isolés dans pane-main et pane. Aucun layout injecté.

Le sélecteur de thème reçoit réellement le clic et le focus : sidebar static dans le panneau587,66px à viewport1280, contre sidebar sticky séparée à1920. Memory et Usage ont aussi deux smokes ciblés (FR1280 et zoom200%) : JSON long intact et borné, tableau accessible au clavier. Toutes les mutations et requêtes externes sont bloquées ; aucun formulaire n’est soumis.

## Restes

Le problème des notices globales non corrélées reste distinct. Ce passage contrôle Compte/Préférences en détail et Memory/Usage ponctuellement (4 sous-pages sur7) ; Projet/Sécurité/IA, dark theme, Safari, appareils physiques, clavier virtuel et soumissions backend réelles ne sont pas validés. Ce lot ne certifie pas toute la plateforme ni les changements sensibles de compte.
