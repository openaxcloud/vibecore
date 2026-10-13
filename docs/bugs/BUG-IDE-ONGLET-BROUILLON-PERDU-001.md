---
id: BUG-IDE-ONGLET-BROUILLON-PERDU-001
---

# BUG-IDE-ONGLET-BROUILLON-PERDU-001

## Bug

Signal transmis par la session parent : job GitHub `115041292778`, run `38318643274`, tête `9c07d3a13394050e7fedd3f7bfb759f663a1f7fe`, à 23:08:59 UTC le 12 octobre 2026. Au premier essai de `ide-file-tab-identity.spec.ts`, l’onglet épinglé est actif mais l’assertion ligne 161 reçoit `PERSISTENCE-ORIGINAL-20261012second line` au lieu de `UNSAVED-A-UNIQUE` pendant cinq secondes. Le retry passe en 13,4 s. La conclusion globale réussie ne clôt pas ce signal.

L’API GitHub confirme le SHA et l’état final réussi. Le téléchargement des logs redirige vers `productionresultssa3.blob.core.windows.net`, hors du domaine supplémentaire autorisé indiqué ; cette destination n’a pas été contactée. Aucune URL signée conservée dans cette note. La connexion locale et l’API GitHub fonctionnent.

Diagnostic local sur branche `codex/pinned-draft-loss-20261012`, base exacte de #731, distinct du lot mobile non poussé. Aucun allongement du délai et aucune suppression d’assertion. Cause CI non attribuée ; une course du listing est démontrée séparément ci-dessous.

## 📤 Dispatché

☑ — diagnostic délégué et revue parent.

## 💻 Codé

☐ — correctif intégré à la branche #731, non fusionné sur main.

## ✅ Testé live

☐ — course démontrée sur stores locaux ; cause du signal CI non attribuée.

## Résultat du diagnostic local

Cinq répétitions ciblées, un worker, zéro retry, délais 30 s / assertion 5 s inchangés : toutes réussies sur le build exact de `9c07d3a`. Mais la trace montre le chargement WebContainer de `stackblitz.com` en échec (`ERR_TUNNEL_CONNECTION_FAILED`, statut réseau -1) ; le runtime n'est pas prêt. Ces passages ne prouvent pas la sûreté d'une autosauvegarde WebContainer réussie. [Mesures sans URL signée](../reprise/mesures/pinned-draft-2026-10-12/baseline.json), [capture inspectée](../reprise/captures/pinned-draft-2026-10-12/baseline-runtime-indisponible.png). Aucun contournement réseau tenté.

## Défaut distinct reproduit et correction proposée

Avec les vrais FilesStore et EditorStore et un adaptateur de test en mode WebContainer : un listing prend le contenu ORIGINAL puis attend ; la sauvegarde de NEW réussit et retire le marqueur dirty ; le listing est libéré et remplace les fichiers **et le document éditeur** par ORIGINAL. La source antérieure échoue aussi pour une sauvegarde volontairement vide, une création absente du snapshot et un runtime remplacé pendant le listing. Les deux contre-épreuves de suppression passaient déjà.

Le correctif de `FilesStore.reloadFromRuntime` capture le runtime et la carte avant l'attente. Il rejette le résultat d'un runtime remplacé et conserve les entrées modifiées entre le début et la fin du listing, y compris créations et suppressions. Le compteur et la garde de listing partiel s'appliquent après cette fusion. Un listing suivant sans modification concurrente continue d'adopter une nouvelle version distante : aucun cache permanent de contenu local ajouté.

Contre-épreuve : source `9c07d3a` remise temporairement, 4 tests en échec / 2 réussis ; correctif rétabli, 6 réussis. Suite ciblée complète : 33 tests réussis sur 7 fichiers (stores fichiers/éditeur, watchers, fichier vide, Monaco). Relecture indépendante favorable. Logs locaux sous `/tmp/pinned-draft-evidence` : `listing-red-final.log`, `tests-final.log`, `baseline.log`.

La cause du premier échec CI demeure **non attribuée**. La course du listing est démontrée séparément ; un ancien événement watcher livré plus tard reste hors de cette correction. La comparaison d'identités suppose des entrées remplacées, comme les chemins de sauvegarde/création/suppression actuels. Ni perte après démontage ni génération ni publication distante ne sont validées. #731 n'est pas déclarée sûre à fusionner sur la seule base de ce travail.

## Contrôles de livraison locale

Lint et formatage réussis. Les étapes web, scripts et Electron du typecheck global passent. L'étape workspace a d'abord échoué à cause de liens locaux de dépendances mélangeant les identités Prisma des deux worktrees ; après raccordement des paquets internes à cette copie du dépôt, l'ensemble de l'étape workspace passe (`typecheck-workspaces-local-links.log`). Versions des dépendances et lockfile inchangés, pnpm 9.14.4.

Build final réussi (`build-final.log`). Aucun test navigateur supplémentaire relancé après ce build : les cinq passages de référence sont ceux de la tête initiale et leur bootstrap WebContainer est refusé. La preuve rouge/verte du patch est celle des stores ; une validation navigateur avec runtime fonctionnel reste nécessaire pour attribuer ou clôturer le signal CI. Aucun push ni fusion.

## Complément demandé par le parent

Huit contre-épreuves du listing passent après ajout des cas sauvegarde refusée et passage A→B. La promesse de sauvegarde refusée rejette, le runtime reste ORIGINAL et le document reste UNSAVED-DRAFT avec dirty=true après libération du listing. Au passage A→B, le provider est simulé par ses vrais appels configureProject/configureRuntime ; le listing A retenu ne réintroduit ni le contenu commun A ni only-a.txt dans B. Un listing ultérieur sans mutation concurrente adopte LATER-EXTERNAL-UPDATE dans les deux variantes de sauvegarde (texte et vide). Aucun nouveau changement produit. Journal : `/tmp/pinned-draft-evidence/additional-tests.log`.

## Intégration dans #731

Revue du snapshot : nanostores `map.setKey` remplace la map par copie ; les écritures de FilesStore remplacent les entrées. Les deux variantes de sauvegarde vérifient maintenant explicitement que map et entrée changent d’identité et que le snapshot retenu conserve ORIGINAL. Aucun chemin produit de mutation directe en place identifié.

Le diagnostic E2E borné ajoute les lectures HTTP fichiers/archive aux signaux existants de sauvegarde et d’éditeur : événements limités à 128, aucun contenu, corps, URL ou identifiant de projet enregistré. L’assertion UNSAVED-A-UNIQUE et ses délais restent inchangés. La cause CI reste non attribuée.

Validation d’intégration : 35 tests stores/éditeur réussis, six gardes d’index réussies après suppression du doublon manuel et régénération à 425 entrées ; lint, formatage et typage strict du diagnostic réussis. Aucun delta mobile intégré. Relecture indépendante favorable.
