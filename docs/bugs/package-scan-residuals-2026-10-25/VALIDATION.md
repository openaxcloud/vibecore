# Résidus Packages et profils Security — validation

Base : merge #781 `d3adf5be9`. Branche distincte `fix/packages-scan-findings-20261025`. Aucun hunk Git, Publish/Deploy, Domains, Debugger ou restauration. BFF partagé : seules sections Packages, helpers scanner et normalisation Security.

## Contrats et contre-épreuves

- npm audit : 0/1 avec rapport v2 valide ; outdated : 0/1 avec objet de dépendances, incluant occurrences multiples et absence de current. Code 1 avec liste vide, erreur structurée, texte ou JSON invalide refusé. Code brut persiste avant retour HTTP.
- Autres gestionnaires : code non nul conservé comme échec ; aucune extrapolation du contrat npm. Yarn Classic/Berry choisi avant audit, un seul audit même lorsqu’il sort en erreur. Test shell avec exécutable Yarn synthétique, pas fournisseur réel.
- Security : source non sélectionnée/échouée/inconnue conservée ; une source complète réussie peut retirer ses constats ouverts absents. hidden/ignored/fixed et createdAt sont préservés, y compris après disparition et réapparition.
- Grep réellement lancé sur fichiers jetables ; limite lignes/octets et marqueur final complet/tronqué vérifiés. Marqueur absent ou couverture tronquée => failed/422 avec code global -1, même si grep renvoie zéro ; aucun faux completed.
- Contre-exemple trouvé en revue : deux lignes SAST identiques sur les 100 premiers caractères mais différentes ensuite héritaient du même triage. Empreinte des détails complets et nouveau test empêchent cette perte de distinction.

## Résultats

- Revue indépendante finale : 102/102 tests sur six fichiers, aucune omission, aucun défaut bloquant identifié. Reprise parent avec garde documentaire : 108/108 tests sur sept fichiers.
- Dont 9 tests shell/Node/grep réels sur données synthétiques ; les contrats BFF utilisent un upstream contrôlé. Aucun npm audit réseau, vrai Yarn fournisseur, runtime distant ou E2E production.
- ESLint ciblé : zéro erreur, un avertissement BFF préexistant ; diff --check vert.
- Build final réussi ; lint global zéro erreur/52 avertissements existants. Typage officiel complet final réussi (web, scripts, helpers navigateur, Electron et paquets/services).

Échecs de développement conservés : fixtures de constats rejetées à raison par le filtre anti-bruit grep (corrigées pour contenir de vraies lignes grep), ancienne assertion supposant qu’un npm remplaçait toutes les sources (corrigée pour exiger leur conservation), collision SAST et couverture inconnue affichée completed (corrigées après revue). Aucun seuil, retry ou exclusion ajouté.

## Preuves #781, distinctes de ce nouveau lot

#781 fusionnée normalement après tous les checks et Release Validation verts. La lecture des protections a été refusée403 et n’a pas été retentée. Passage ready via connecteur : erreur sans détail récupérable ; historique de tâche et logs disponibles vérifiés. Lecture GraphQL ensuite : même tête, draft=true, viewerCanUpdate=true. Une unique reprise normale gh pr ready a réussi, puis fusion REST avec SHA attendu ; aucun admin/bypass.

[CI exacte #781](https://github.com/openaxcloud/vibecore/actions/runs/40198258755) : installation frozen-lockfile, tests unitaires10124 réussis/4 omis ; les quatre suites de sécurité ci-dessous passent explicitement dans ses journaux. Les chiffres locaux de suite complète (10128 réussis/8 échecs/7 omis et une suite non chargée) restent distincts, jamais remplacés par un faux vert local.

| Dépendance | Banc local installé | Version verrouillée | Preuve CI |
|---|---|---|---|
| shell-quote | 1.8.4 | 1.11.0 | shell-quote-security.spec.mjs,10/10 |
| compression | 1.8.1 | 1.8.2 | compression-close-security.spec.mjs,1/1 ; install journalise1.8.2 |
| tinypool | 1.1.1 | 2.1.2 | tinypool-security.spec.mjs,1/1 |
| ws | 8.20.0 | 8.22.0 | ws-fragment-security.spec.mjs,1/1 ; install journalise8.22.0 |

Sept assertions rouges locales correspondent à ces quatre suites ; package.json, lockfile et gardes identiques à main. Deux autres problèmes locaux ont des reprises ciblées vertes : lien workspace-agent déclaré manquant (1/1), magasin pnpm par défaut inaccessible sous /home/agent puis magasin existant /workspace (admin1/1). Aucun téléchargement pour remplacer artificiellement ces résultats.

[Production E2E #781](https://github.com/openaxcloud/vibecore/actions/runs/40198258707) : suites principales469 passages directs,1 flaky après retry (ide-panel-visibility,1280),26 skips ; canari WebKit distinct17 passes/3 skips. [Audit i18n](https://github.com/openaxcloud/vibecore/actions/runs/40198258765) quatre formats vert. Cela ne certifie ni Safari physique ni recette E-Code.

[Déploiement du merge #781](https://github.com/openaxcloud/vibecore/actions/runs/40200502172) encore en file au moment de ce relevé ; aucune version servie nouvelle vérifiée. Recette production reste bloquée par la reconnexion E-Code.

## Environnement du worktree

Premier typage global : erreurs Prisma dans les tests API inchangés, dues aux liens @vibecore pointant encore vers le checkout initial alors que les imports relatifs utilisaient le nouveau worktree. Liens locaux corrigés vers les paquets du worktree, sans changement de source API/tests, de dépendance ni de lockfile. Le contrôle complet repris après cette correction réussit (code0) ; le rouge initial n’est pas effacé.

## Blobs produit de la revue finale

Groupes Git à concaténer : Packages `494d9b53 d1bf2f11 fb5cf36b b81e8653 a9165b7d`, Security `f8a7a7ed 2321ed59 23d43778 3e85a343 b312a2be`, BFF `b8760260 5acf8a74 8e545185 776e8ff9 5dab74ad`. Aucun changement produit après cette revue.
