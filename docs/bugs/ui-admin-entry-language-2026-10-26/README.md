# Préserver la langue à l’entrée Administration

Worktree isolé admin-redirect-next, base `279440d2f`. Aucun changement de public-admin, de la tête publiée #802, de droits, d’authentification ou de composants Administration partagés.

Le reçu navigateur synthétique historique before13199 montrait `/admin?lang=fr` redirigé vers `/admin/overview` avec titre « Admin overview ». `before-browser-extract.json` conserve les seules observations `/admin`, la référence originale et son SHA256. Ce n’est pas une nouvelle recette navigateur.

Cause : `admin._index.tsx` attend `requirePlatformAdmin(request)`, puis renvoie une destination constante. Correction : après la même garde, lire uniquement `lang`, l’encoder avec URLSearchParams et le reporter sur `/admin/overview`. Aucun paramètre d’export, probe, returnTo ou autre n’est transmis. La résolution de langue reste celle de la destination ; aucune nouvelle règle linguistique introduite.

Aucun test de contrat GET de ce redirect n’existait. `admin._index.spec.ts` réutilise le pattern de mock de garde du test admin.billing existant. Avant : deux échecs attendus FR/EN, deux réussites (destination sans langue et refus403 synthétique). Après : quatre réussites. C’est un test de loader avec Request GET et auth simulée, pas un test réel de backend ou une recette de compte administrateur. Aucun POST ni accès externe.

Lint et Prettier ciblés passent ; logs archivés, fins de lignes normalisées.32 PR ouvertes inspectées, avec pagination des listes longues : aucun chevauchement de `admin._index.tsx`. Aucun build redondant lancé pour ce redirect pur ; aucune nouvelle recette visuelle ni couverture des petits contrôles AdminUsers. Aucun index ni push. Main/live restent faux.

## Revue indépendante

final_review a lu le diff et les tests : avis favorable. La garde reste attendue avant lecture URL et redirect, destination relative fixe et statut 302, seul lang encodé ; aucun changement de droits ou possibilité de redirection externe. Réserve non bloquante : valeurs vides, doublons et langues non reconnues non exercés ; l’implémentation conserve la première valeur et laisse le résolveur existant décider. Pas de recette HTTP du build compilé effectuée pour ce lot ; les preuves après sont celles du loader local.
