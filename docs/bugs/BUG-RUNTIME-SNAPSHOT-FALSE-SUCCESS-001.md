---
id: BUG-RUNTIME-SNAPSHOT-FALSE-SUCCESS-001
section: "Reprise commerciale du 2026-10-18 — preuves de sauvegarde et restauration"
---

## Bug

**La restauration d’un instantané runtime par identifiant annonçait un succès sans restaurer de fichier.** Sur `main` `44a8e01bc1010732cb5862c346071e4411d0511d`, l’API et l’outil `restore_snapshot` envoyaient `{ snapshotId }` à l’agent. Son schéma attendait `{ files }` avec `[]` par défaut : l’identifiant était ignoré et la réponse était `200 { restoredFiles: 0 }`, puis `204` côté API. La création ne conservait aucune archive : seulement un identifiant calculé et un inventaire chemin/hash/taille.

## 📤 Dispatché

2026-10-18 — correctif borné demandé après audit en lecture seule, dans `codex/snapshot-restore-contract-20261018`, sans toucher aux PR #735 et #736.

## 💻 Codé

Candidat local rebasé sur `main` `c6439da55bebf180fe43dce65dbc5c32e6a9fa0a` après fusion de #735 ; ce correctif n’est ni fusionné ni déployé. L’API refuse création et restauration runtime par ID avec `503 SNAPSHOT_ARCHIVE_UNAVAILABLE`, après les contrôles d’accès et avant quota, instantané de sûreté ou appel au gestionnaire. Le refus protège aussi un déploiement où l’ancien agent serait encore présent. L’agent refuse lui aussi sa fausse création et exige un corps strict avec `files` explicite pour appliquer des contenus. Messages EN/FR disponibles.

La restauration durable du runtime reste à implémenter. Ce correctif supprime une fausse garantie ; il n’ajoute ni archive du PVC, ni stockage d’instantanés runtime, ni résolution d’ID. Le contrat agent `{ files }` conserve sa sémantique d’application de fichiers ; `files: []` annonce explicitement zéro écriture. Les instantanés de projet existants restent utilisables pour les fichiers enregistrés dans le stockage du projet.

## ✅ Testé live

Non. Aucun appel cloud, aucun paiement, aucune donnée client et aucune restauration en production. Le contrôle ci-dessous porte sur des serveurs HTTP locaux et des répertoires temporaires.

## Preuve

- Régression `services/workspace-agent/src/snapshot-contract.spec.ts` : vrai agent HTTP sur un port éphémère, vrais fichiers sur disque. Sur la base inchangée : 4 échecs attendus et 3 témoins verts (ID seul, corps vide, ID+files ambigu et création sans archive). Les témoins vérifient les octets texte/binaire, le contrat vide explicite et le refus d’un jeton signé pour un autre espace.
- Régression `services/api/src/tests/runtime-snapshot-contract.spec.ts` : vraie API HTTP et `LocalProjectStorage`, métadonnées/authentification explicitement en mémoire via `TestApiStore`. Un écouteur local de contrôle répond toujours 404 et compte les appels ; il ne simule aucune restauration. Le refus doit survenir sans le joindre. Vérification des messages EN/FR, de l’appartenance de l’espace, de l’absence d’usage facturé et d’instantané de sûreté créé par les outils refusés. Témoin : création d’une archive de projet, modification du fichier puis restauration sur disque via les routes existantes.
- Journaux locaux : `/tmp/vibecore-snapshot-contract-red.log`, `/tmp/vibecore-api-snapshot-contract-red.log`, puis les fichiers correspondants `-green.log`. Les fichiers temporaires du banc sont nettoyés par les tests.
- Validation initiale : 9/9 tests agent (contrats + i18n), 10/10 tests API (contrats + rôles), 17/17 tests du catalogue EN/FR, 6/6 contrôles de l’index. Contrôles de types agent et API complet sans diagnostic (`tsc --noEmit -p services/api/tsconfig.json`). Les deux nouveaux fichiers de tests passent ESLint ; comparaison de chaque diagnostic des trois fichiers de production concernés avec `44a8e01bc` : aucun ajout (340 erreurs et 19 avertissements préexistants, sans prétendre que le lint global est vert).
- Le premier contrôle de types API avait rencontré trois diagnostics dans `mcp-marketplace.spec.ts` à cause du montage local des dépendances : deux identités Prisma provenant de deux worktrees. Les seuls liens `node_modules` de ce candidat ont été remplacés par des répertoires locaux pointant les paquets du workspace vers ce worktree ; aucune cible partagée n’a été modifiée, aucune configuration de typecheck n’a été assouplie. Le contrôle complet a ensuite terminé avec code 0.
- Contre-épreuve finale API : substitution temporaire de `app.ts` par le fichier exact de `44a8e01bc`, sans changer les tests ni le stockage. Résultat : 6 refus attendus rouges et les 2 témoins appartenance/restauration de projet verts. Restauration byte-identique du candidat dans un `finally`, puis nouvelle validation verte. Journal : `/tmp/vibecore-api-snapshot-contract-counter.log`.
- Rebase sur `c6439da` : seul conflit dans l’index, repris depuis `main` puis régénéré par `node scripts/migrer-inventaire-bugs.mjs --index` (430 entrées). Les trois fichiers agent et le test API sont identiques par SHA256 ; les lignes ajoutées/supprimées du correctif dans `app.ts` et le catalogue API sont exactement celles du commit initial `855f2240f`. Aucun fichier dérivé Prisma n’a été fusionné à la main.
- Validation après rebase, mémoire mesurée avant lancement à 1,7 Gio utilisés sur 17 Gio : **27/27 tests API**, **121/121 tests agent** (suite complète, 11 fichiers, aucun skip), **6/6 contrôles d’index**. Typecheck API complet relancé et terminé avec code 0. Journaux : `/tmp/vibecore-snapshot-rebase-api-tests.log`, `/tmp/vibecore-snapshot-rebase-agent-full.log`, `/tmp/vibecore-snapshot-rebase-index.log`, `/tmp/vibecore-snapshot-rebase-api-typecheck.log`. Aucune attente ancienne `snapshots/create → 200` n’a dû être changée. Les scénarios de coupure d’un téléphone sont simulés côté serveur, pas des essais Safari réel.
- Comparaison ESLint après rebase entre `app.ts` de `c6439da` et le candidat : 324 erreurs / 14 avertissements des deux côtés, aucun diagnostic ajouté (`/tmp/vibecore-snapshot-rebase-lint-comparison.json`). Les fichiers agent et les nouveaux tests sont inchangés depuis leur validation précédente.

## Portée de l’audit sauvegarde sur main44a8

| Composant | Code et fusion | Tests/procédure présents | Déploiement actuel | Preuve de restauration en production actuelle |
| --- | --- | --- | --- | --- |
| Archives de projet | ZIP dans `LocalProjectStorage` + copie `ProjectStorageObject` PostgreSQL avec SHA256 ; appartenance du snapshot au projet contrôlée, point de sûreté | Tests locaux de stockage/API ; témoin disque ajouté dans ce candidat | Non vérifié dans cet audit | Non obtenue |
| Checkpoints | Fichiers de l’arbre API/Filestore ; barrière des écritures API, sans gel des écrivains du PVC ni des clients SQL ; aucune atomicité fichiers/DB revendiquée | `checkpoint-restore-proof.spec.ts` emploie `MemoryProjectStorage` + `TestApiStore` ; preuve logique isolée | Non vérifié | Non obtenue |
| Instantanés runtime | Ancien contrat défectueux décrit ci-dessus ; refus honnête seulement dans ce candidat | Régression HTTP/disque ci-dessus | Correctif non déployé | Non obtenue |
| PITR des bases projet | Manifestes CNPG, soumission Backup/recovery Cluster, maintenance | `database-provisioner.spec.ts` utilise un port K8s simulé ; routes avec store mémoire/Noop ; aucun exercice CNPG exécuté ici | ConfigMap source active le drapeau ; valeur servie et état CNPG non vérifiés | Non obtenue |
| Base de plateforme | Terraform configure Cloud SQL régional, PITR 7 jours et 30 sauvegardes | `BACKUP_RESTORE.md` et `DISASTER_RECOVERY.md` décrivent objectifs/étapes ; le script dry-run crée et restaure ses propres fixtures, pas une sauvegarde de plateforme | État Terraform appliqué non vérifié | Non obtenue |
| Corbeille / suppression runtime | PR #735 ajoute un verrou de projet et `runtimeDeletionPending` empêchant la restauration après fermeture pour suppression définitive ; fusionnée dans `c6439da` depuis l’audit initial | Tests PostgreSQL ciblés réalisés dans cette autre branche | Non vérifié par cet audit | Non obtenue ; aucune preuve de sauvegarde apportée par ce verrou |

Autres blocages vérifiés dans le code, signalés séparément au parent et non corrigés ici :

- `services/api/src/app.ts` sur main44a8, maintenance lignes 33788–33796 : `COMPLETED` dépend seulement de `progress.ready`. `database-provisioner.ts:746–754` ne fait que lire l’état du cluster récupéré ; `prisma-store.ts:3156–3172` ne met à jour que le statut/les dates. Ce chemin ne bascule pas la connexion de l’application vers les données récupérées.
- La route de restauration sélectionne une instance par environnement (`app.ts:35739–35747`) mais ne transmet pas cet environnement à `startRestore` (`35822–35828`). Le provisioner construit la source depuis le nom de développement (`database-provisioner.ts:411`) ; le Backup à la demande vise aussi ce nom sans environnement (`393`). Le contrat de restauration production n’est donc pas conservé jusqu’au stockage physique.
- La maintenance crée une ligne snapshot avant tout succès physique et absorbe l’échec de soumission (`app.ts:33766–33775`). La fenêtre des recovery-points est calculée depuis la rétention du plan, sans preuve de disponibilité des WAL. Une ligne de métadonnées ou un cluster sain ne prouve pas la restauration des données attendues.
- Restauration de projet vers le Pod, distincte de la restauration sur disque API : `app.ts:16394–16398` transmet `path` et `content`, sans `encoding`, alors que les fichiers binaires issus de `LocalProjectStorage` portent leur contenu en base64 (`project-storage.ts:64–68`). Les erreurs d’écriture/suppression du Pod sont absorbées (`app.ts:16398–16408`). Le témoin ajouté ici vérifie les octets de l’archive et du disque API ; il ne prouve ni les octets ni la convergence du Pod. Ce défaut de contrat et cette absence de retour de convergence ont été signalés pour une tranche séparée, sans modification de ce chemin dans le présent candidat.

Prérequis restant hors de cette session locale : accès opérateur autorisé pour observer sauvegardes/WAL/IAM et rétention effective ; source de restauration isolée et budget précis avant toute ressource payante ; exercice réel vérifiant données, isolation, reconnexion, démarrage, fichiers/PVC et retour arrière. Les constats du runbook de juin/juillet ne sont pas utilisés comme état actuel. Les RPO/RTO documentés sont des objectifs, pas des mesures obtenues.
