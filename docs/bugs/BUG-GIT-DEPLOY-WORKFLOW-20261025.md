---
id: BUG-GIT-DEPLOY-WORKFLOW-20261025
---

# Git, publication et domaines : continuité des opérations

## Bug

**Des requêtes tardives et doubles clics rendent les panneaux Git et Déploiement incohérents ; une erreur Domains peut apparaître comme une liste vide.** L’utilisateur demande le 25 octobre un audit et des corrections du parcours web desktop, notamment le doublon Domains/Deploy.

## 📤 Dispatché

25 octobre 2026 : audit parallèle Git et Déploiement, base main `941d7d7fc`. PR ouvertes vérifiées avant modification ; #768 et #764 exclues de toute opération. PR concurrente #781 identifiée et préservée.

## 💻 Codé

Correctifs locaux sur `fix/git-deploy-workflow-20261025`, pas intégré à main. Domains est déjà un alias de navigation vers Deploy dans cette base ; le backend et les liens existants sont conservés. Aucun achat, changement DNS ou publication de projet client.

Git isole les lectures et mutations par projet/espace et démontage, interdit les doubles soumissions et affiche les erreurs d'inspection avec reprise. Une actualisation silencieuse qui supplante le premier chargement ne peut plus présenter un faux état vide. Les confirmations discard/restore utilisent le dialogue partagé, avec gestion du focus et d'Échap.

Domains dispose d'un chargement explicite, d'une erreur persistante avec actualisation et d'un verrou immédiat ; les réponses d'une ancienne visite A→B→A sont ignorées. Publication reçoit l'état occupé de l'hôte et bloque les doubles gestes. Le retour arrière choisit une version historique READY compatible avec le fournisseur et l'environnement ; il n'envoie plus l'identifiant du dernier échec au backend. Les actions Manage respectent les états admissibles du serveur.

## ✅ Testé live

Production non certifiée ; QA production déconnectée. Recette locale isolée en cours. Revue indépendante favorable après intégration des observations, 19 tests contrôlés réussis au moment de cette revue. Les résultats contrôlés, opérations réelles locales et version déployée sont distingués ; aucun test de fournisseur externe n'est revendiqué.

Échecs intermédiaires conservés : lancement pnpm avec auto-installation impossible dans le profil utilisateur ; utilisation des binaires installés. Premier typecheck pendant édition a rencontré l'import placé avant la directive historique BaseChat et une enveloppe inconnue non typée : corrigés. Premier lint global a détecté deux espacements : corrigés. Scanner i18n a refusé deux textes d'erreur internes : remplacement par état structuré, scanner effectif vert sans exemption. Premier navigateur dev a rencontré un cache React incohérent puis un ancien sélecteur d'ouverture absent ; aucun de ces résultats ne certifie une action Git.

## Critères à vérifier

- Git : état/diff, branches, commit, push/pull et conflits selon les capacités réelles ; erreurs de chargement et changements de projet.
- Déploiement : état et URL, publication/mise à jour, progression et logs, annulation, erreurs récupérables, historique et rollback réellement pris en charge.
- Domains : chargement, erreur et reprise, conservation des fonctions backend et navigation commune.
- Navigateur : desktop, tablette/mobile, redimensionnement/scroll, menus/dialogues, double clic et retour arrière.

Aucune parité Replit ni certification complète d’un panneau ne découle des seules corrections de code.
