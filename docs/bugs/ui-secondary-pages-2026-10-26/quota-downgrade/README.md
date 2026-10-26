# Quota et Downgrade : audit11499 et correction locale

[Avant11499, contrats, limites et contrepreuves](before11499/README.md). Données synthétiques uniquement.88 observations sur deux routes et11formats,8 groupes d’interactions,4cas GET503/403 ; aucune opération financière exécutée. Les réexécutions ciblées et diagnostics restent distincts, pas additionnés aux cas uniques.

Le défaut quota concerne les deux liens :34px aux quatre grands formats,16 observations FR/EN×thèmes. Contrepreuve DOM à1440 :34→44px, sans changement de contenu/href. Correction locale min-h-[44px], deux gardes existantes adaptées ;18 tests verts, lint ciblé0. La contrepreuve DOM ne constitue pas le résultat compilé.

## Recette compilée après correction11599

Le parent a fourni le build final et le typage réussis. La recette11599 termine avec44 observations Quota uniquement (11formats ×FR/EN ×clair/sombre), les88 mesures de liens≥44px et contenues, puis quatre groupes focus/Escape/comparaison/Retour après redimensionnements. Zéro erreur JavaScript et zéro mutation tentée. Les44 observations Downgrade11499 ne sont pas rejouées ni comptées11599. Aucun achat, portail, checkout ou modification d’abonnement. [Résultats compilés](after11599/README.md).

Script réutilisable : `before11499/audit.cjs`. Les options ont été ajoutées après la recette initiale pour sélectionner Quota et activer les assertions du correctif ; comportement initial sans options conservé. L’import Playwright archivé est relatif à la résolution des dépendances du dépôt. Commande de reproduction avec serveur synthétique équivalent prêt :

```sh
mkdir -p /tmp/ui-quota-final
UI_BASE_URL=http://127.0.0.1:11599 UI_EVIDENCE_DIR=/tmp/ui-quota-final UI_QUOTA_ONLY=1 UI_ASSERT_FIXED=1 node docs/bugs/ui-secondary-pages-2026-10-26/quota-downgrade/before11499/audit.cjs
```

Les configurations fixture/origines avant sont archivées ; seuls leurs propriétaires gèrent les serveurs. Les scripts de récupération pointent leur fichier de pannes local historique et doivent être adaptés à une fixture isolée équivalente, jamais à la production. Aucun nouveau secret/accès ; cookie purement synthétique. Publication/main/déploiement ne sont pas attestés par ce dossier.
