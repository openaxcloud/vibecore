# Diagnostics des gestionnaires de paquets — 25 octobre 2026

Base 6461f0a6. Ce complément distingue constat de dépendance et panne de commande, sans modifier le code de sortie conservé. Aucune installation, clé fournisseur, publication ou donnée réelle utilisée.

## Contrats primaires consultés

- [pnpm 9.14.4 audit, lignes 204–237](https://github.com/pnpm/pnpm/blob/v9.14.4/lockfile/plugin-commands-audit/src/audit.ts) : JSON advisories + metadata.vulnerabilities ; code 1 avec constats. Les configurations d’exclusion peuvent laisser une liste advisories vide et un compte positif : ce cas reste un rapport de diagnostic.
- [pnpm 9.14.4 outdated, lignes 215–218 et 284–307](https://github.com/pnpm/pnpm/blob/v9.14.4/reviewing/plugin-commands-outdated/src/outdated.ts) : objet par paquet, wanted/isDeprecated/dependencyType et latest facultatif ; code 1 avec résultats.
- [Yarn Classic 1.22.22 audit](https://github.com/yarnpkg/yarn/blob/v1.22.22/src/cli/commands/audit.js) et [reporter JSON](https://github.com/yarnpkg/yarn/blob/v1.22.22/src/reporters/json-reporter.js) : NDJSON et auditSummary, code égal au masque des sévérités. Le parseur exige la correspondance exacte et refuse une ligne error.
- [Yarn Classic outdated](https://github.com/yarnpkg/yarn/blob/v1.22.22/src/cli/commands/outdated.js) : table JSON et code 1 lorsque des lignes existent.
- [Yarn 4.5 audit](https://github.com/yarnpkg/berry/blob/%40yarnpkg/cli/4.5.0/packages/plugin-npm-cli/sources/commands/npm/audit.ts), [construction des rapports](https://github.com/yarnpkg/berry/blob/%40yarnpkg/cli/4.5.0/packages/plugin-npm-cli/sources/npmAuditUtils.ts), [sérialisation](https://github.com/yarnpkg/berry/blob/%40yarnpkg/cli/4.5.0/packages/yarnpkg-core/sources/treeUtils.ts) : arbres NDJSON contenant ID/Issue/Severity/Vulnerable Versions/Tree Versions/Dependents ; code 1. La forme source est retenue plutôt que la description générique « réponse registre brute ».
- [Bun audit](https://bun.com/docs/pm/cli/audit) et [tests officiels](https://github.com/oven-sh/bun/blob/main/test/cli/install/bun-audit.test.ts) : --json émet les groupes d’advisories du registre ; code 1 avec vulnérabilités après filtres. La commande du panneau demande désormais --json.

## Portée et limites

Les fixtures des tests sont synthétiques, construites selon ces sources. Les cas négatifs conservent les pannes réseau, rapports tronqués, codes 127 et incohérences de résumé comme échecs. Aucune preuve fournisseur ni certification E2E/production n’en découle.

Bun outdated n’a pas de contrat de code non nul validé ici : il reste en échec sur code non nul. Yarn moderne n’offre pas nécessairement la commande outdated Classic : un échec de commande n’est jamais transformé en résultat. Les formats inconnus restent refusés. Les codes zéro hors npm gardent le sens de commande terminée, pas de couverture exhaustive ni d’absence de vulnérabilité ; les filtres/configurations des projets restent applicables.

Outils disponibles au démarrage : Node 24.19.0, pnpm 11.25.0 ; Yarn et Bun absents. Les sources pnpm9 décrivent le contrat historique explicitement pris en charge, sans prétendre qu’elles constituent un essai du binaire local pnpm11.

## Validation locale

- Vitest : 83/83 (53 contrats supplémentaires + 30 route/dispatch existants), aucun skip. ESLint ciblé puis lint global réussis (0 erreur, 52 avertissements existants). Typage global complet réussi après les corrections de revue, avec pnpm 9 et dépendances locales reliées sans installation. Build global final réussi (exit 0) après stabilisation des corrections de revue ; aucune recette navigateur revendiquée.
- Binaire réel pnpm 11.25.0, répertoire temporaire synthétique et serveur HTTP loopback : outdated retourne code 1, un GET local et JSON avec latest=2.0.0, wanted=1.0.0, isDeprecated=false, dependencyType=dependencies ; aucune installation. Le rapport correspond au parseur pnpm ajouté.
- Tentatives antérieures conservées dans le bilan : options CLI registry/fetch-retries refusées ; absence de lockfile refusée ; variables npm_config ignorées par pnpm11, entraînant une tentative DNS vers registry.npmjs.org pour le seul nom synthétique (EAI_AGAIN, processus interrompu, aucun résultat fournisseur). Puis configuration pnpm-workspace.yaml explicite vers loopback ; premier manifest simulé incomplet rejeté, complété avec dist/time ; succès ci-dessus. Environnement enfant réduit à PATH/HOME temporaire/CI et configuration de test, sans credential. Tous les répertoires de fixture sont supprimés par finally.

Cette sonde est un vrai binaire contre un registre simulé ; elle ne démontre pas un audit de dépendances réel, une installation, un accès au registre public ni un parcours utilisateur complet. Yarn et Bun ne sont pas exécutés localement.

Revue indépendante : favorable après correction de trois contre-exemples (groupes Bun vides parmi les groupes avec constats, identifiants facultatifs Bun/Berry, lignes advisory Classic invalides malgré résumé cohérent). Les IDs absents sont acceptés, les IDs présents maltypés refusés. Un premier rejeu intermédiaire avait 81 succès/1 échec avant correction effective du groupe vide ; le dernier rejeu a 83 succès, également reproduits indépendamment.
