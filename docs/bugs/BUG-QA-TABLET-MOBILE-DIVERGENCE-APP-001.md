---
id: BUG-QA-TABLET-MOBILE-DIVERGENCE-APP-001
---

## Bug

**Écarts de traitement 390 ↔ 768 dans l'espace utilisateur — la tablette montre des commandes que le mobile n'a pas, sur TOUTES les routes.** Rappel de la règle posée par Avi le 27/08 : « pour tablet ce doit être comme mobile ». Ces écarts y contreviennent. **(a) Systématique, sur les 17 routes à coque applicative, en clair ET en sombre — commandes présentes en 768, absentes en 390.** **Retenu : `Ouvrir la palette de commandes`** (bouton « ⌘ Rechercher » de l'en-tête). Conséquence : **sur iPhone, l'utilisateur ne peut pas ouvrir la palette de commandes** depuis l'en-tête ; sur iPad, il le peut. 🚫 **RETIRÉ DU PÉRIMÈTRE — décision d'Avi du 28/08 : la bascule de langue absente en 390 px n'est PAS un défaut.** Les libellés `Anglais` et `Langue actuelle : Français` avaient été relevés par ma sonde comme absents en 390 ; **ce point est clos et ne doit pas être re-signalé lors d'un prochain balayage.** Motif donné : la langue **suit le navigateur par défaut**, elle se change **dans les paramètres de l'IDE**, et le sélecteur **existe déjà sur les pages marketing**. L'absence du sélecteur dans l'en-tête applicatif en 390 px est donc un choix de densité assumé, pas une perte de fonction. **(b) `/projects/new` — 16 commandes supplémentaires en 768** : le bloc **« TYPE DE CRÉATION »** avec ses 10 puces (`Web`, `Mobile`, `Présentation`, `Animation`, `Design`, `Visualisation de données`, `Automatisation`, `Jeu 3D`, `Document`, `Tableur`), la section **« ESSAYER UN EXEMPLE »** avec ses 3 exemples de prompts et son bouton `Actualiser les exemples de prompts`, et la section **« MODÈLES — Partir du catalogue existant »**. En 390 px, tout cela est remplacé par un unique accordéon replié **`Options avancées — Web`** (seul libellé présent en 390 et absent en 768). Longueur de contenu : **1392 caractères en 390 contre 1793 en 768**. C'est la **surface de création de projet**, donc le parcours d'entrée du produit : un utilisateur iPhone ne voit ni les types de création, ni les exemples, ni les modèles. **(c) `/deployments`, `/search`, `/explore`, `/gallery`** — bandeau d'annonce marketing présent en 768 seulement (`Commencer`, `Fermer l'annonce`, `Parler à un expert d'E-Code…`). Écart réel, mais **d'impact faible** et plutôt favorable au mobile ; listé pour l'exhaustivité. **Seule `/settings` ne présente aucun écart.**

## 📤

☐

## 💻

☐

## ✅

✅ **28/08** mesuré live, 84 mesures, captures appariées

## Preuve

**Captures** : `docs/audit/evidence-2026-08-27/creation-projet-390.png` et `creation-projet-768.png` — la comparaison est directement lisible (en 768 : en-tête avec « ⌘ Rechercher » et EN/FR, 10 puces de type, 3 exemples, section Modèles ; en 390 : aucun des trois, accordéon « Options avancées » à la place). **Méthode** : 21 routes × {390, 768} × {clair, sombre} = **84 mesures**, comparaison des ensembles triés de libellés de contrôles visibles à conditions égales. Données : `/tmp/qa-sweep/mob/surfaces-art/surfaces.json`. **Résultats positifs du même balayage** : **zéro débordement horizontal** et **zéro image cassée** sur les 84 mesures. 🚫 **`/admin` — NON COUVERT, à ne compter ni comme conforme ni comme défaillant.** La route redirige vers `/dashboard` (mesuré en 390 et 768, clair et sombre : `urlFinale=/dashboard`, contenu identique à celui du tableau de bord). Motif : le compte QA `qa-sweep-aug26@audit.local` créé pour cette campagne **n'a pas le rôle plateforme** ; la redirection est donc le comportement attendu pour un utilisateur non-administrateur, et **ne prouve rien** sur la surface d'administration elle-même. **Conséquence** : aucune des surfaces `/admin/*` — facturation plateforme, fournisseurs OAuth, portefeuilles, Stripe — n'a été balayée, ni en responsive, ni en fonctionnel. **Pour lever ce trou** il faut un compte de test doté du rôle plateforme sur l'environnement d'audit (à décider avec Avi).

