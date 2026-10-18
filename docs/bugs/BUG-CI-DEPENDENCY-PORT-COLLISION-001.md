---
id: BUG-CI-DEPENDENCY-PORT-COLLISION-001
section: "2026-10-18 — Vérification avant commercialisation"
---

# BUG-CI-DEPENDENCY-PORT-COLLISION-001 — Port hôte fixe occupé avant l'audit

## Bug

P1 — L'audit FR tablette de #736 (run 39160221264, job 117771846343) échoue avant migrations, API et Playwright : Docker refuse deux fois `0.0.0.0:55432` à 19:49:24.402 et 19:49:25.508 UTC le 18 octobre 2026. Même défaut dans #735, job 117754321534 ; sa reprise 117758343305 passe sur le même commit de fusion avec quatre tests, 280/280 JSON, 560/560 captures et 2/2 preuves de négociation. Les workers diffèrent ; #736 indique westus, #735 eastus. Le propriétaire du port n'est pas journalisé : aucune preuve d'un hôte partagé ni d'un processus particulier.

## 📤 Dispatché

☑ — 18/10/2026, correction CI isolée autorisée.

## 💻 Codé

☐ — travail local, ni fusion ni push sur main.

## ✅ Testé live

☐ — aucune exécution du correctif sur GitHub ni preuve de production.

## Périmètre

Le workflow i18n, l'action composite E2E et le workflow runtime imposent les mêmes ports hôtes et réutilisent ces constantes pour leurs clients. Le retry recrée la pile en demandant exactement le même port. Le correctif doit isoler projet Compose et ports, conserver les healthchecks et tous les contrôles, propager les ports attribués et ne nettoyer que les ressources créées par le job.

## Correctif local

`scripts/ci-local-dependencies.mjs` est appelé par les trois chemins existants. Chaque invocation crée un projet Compose à UUID, un fichier d'environnement vide et un enregistrement privé de propriété sous le répertoire temporaire du runner. Le handle est exporté dans `GITHUB_ENV` **avant** la première mutation Docker. Un projet préexistant est refusé, jamais adopté ; un second démarrage ne peut pas écraser le handle d'un premier.

Les quatre publications PostgreSQL, Redis, SMTP et UI Mailpit demandent `127.0.0.1:0` : Docker réserve les ports, sans préselection ni fenêtre entre un sondage et le bind. Tous les appels Compose gardent ces mêmes paramètres, indépendamment des variables clients exportées ensuite. `compose port` fournit les ports numériques, validés comme une seule adresse loopback ; une réponse absente, multiple, hors plage ou publique fait échouer le démarrage, sans fallback fixe. Les URLs PostgreSQL/Redis et ports clients sont transmis aux étapes de migration, API et tests via `GITHUB_ENV` après succès complet.

Les healthchecks existants et `up --wait --wait-timeout 180` restent. L'attente TCP de 180 secondes vise désormais les ports publiés réellement, y compris SMTP. Deux tentatives maximum ; un échec de suppression de notre pile interdit la seconde tentative. Les échecs finaux restent bloquants. Les commandes de diagnostic et de nettoyage exigent l'enregistrement de propriété, n'ont aucun fallback vers le projet `vibecore` et utilisent uniquement le projet de l'invocation. Les étapes `always()` nettoient après conservation des preuves. Aucun `prune`, suppression par port ou arrêt d'un processus inconnu.

Les valeurs de développement dans `docker-compose.dev.yml` et le workflow général `ci.yml` sont inchangés. La collision du job i18n ne prouve pas que les services de `ci.yml` occupaient son hôte. Aucun seuil, nom de contrôle requis, verdict, exemption, nombre de preuves, canari ou règle de déploiement n'est modifié.

## Contre-épreuves locales

Base des preuves initiales : `44a8e01bc1010732cb5862c346071e4411d0511d`, branche indépendante `codex/ci-port-isolation-20261018`, sans les PR #735/#736 à cette étape. Aucun push ni relance GitHub par cette session.

- **Rouge avant correction** : trois tests exécutent les vraies chaînes `run` des workflows/composite avec un Docker instrumenté qui refuse le port fixe. Trois échecs avec deux refus de bind chacun, `/tmp/vibecore-ci-ports-red.log`. Le même harnais devient vert avec les ports alloués. L'instrumentation existe uniquement dans le test.
- Les régressions `scripts/ci-local-dependencies.spec.mjs` exécutent le CLI réel et vérifient propagation des URLs, santé aux deux tentatives, erreur finale, suppression incertaine, projet préexistant, handle invalide/absent/réutilisé, ports stables pendant diagnostics/cleanup, absence de nettoyage global et deux invocations distinctes. De vrais listeners TCP locaux contrôlent l'attente de connectivité. Les gardes du montage, des tranches et du canari restent exécutées.
- **Docker réel**, commande `node scripts/check-ci-local-dependencies-docker.mjs pgvector/pgvector@sha256:ccc6e83d6e35e931dc7c5def2022729d5a6c370318d099181995567ff1fb4d6b`, code 0 ; `/tmp/vibecore-ci-ports-docker.log`. Socket Docker Unix local, image déjà en cache, `pull_policy: never`. Un listener appartenant au test tient 55432. L'ancienne publication échoue deux fois sur ce port ; deux projets PostgreSQL simultanés obtiennent **32768 et 32769** et répondent via leurs URLs hôtes exportées. Une table créée dans le premier est absente du second, puis chacun stocke son propre marqueur. Après nettoyage du premier, le second reste lisible ; le témoin reste accessible après les deux nettoyages. Vérification finale : aucun conteneur, volume ni réseau des trois projets d'essai. Le conteneur QA préexistant `dca82a6da993`, sur 55439, est conservé et n'est pas interrogé par ce test.
- Mémoire cgroup : 3,16 Go avant travaux, maximum **observé** pendant l'essai 7,91 Go sur 16 Gio, puis 5,63 Go. Les mesures incluent le travail parallèle du parent ; aucun pic exhaustif ni consommation attribuée au seul essai n'est revendiqué.

Validation finale : **59/59 tests, cinq fichiers, zéro skip**, un worker, 53,29 s ; `/tmp/vibecore-ci-ports-tests-final.log`. Commande : `pnpm exec vitest run scripts/ci-local-dependencies.spec.mjs tests/guards/ci-demarrage-pile.spec.ts tests/guards/ci-canari-borne.spec.ts tests/guards/e2e-tranches.spec.ts scripts/index-a-jour.spec.mjs --maxWorkers=1 --minWorkers=1`.

Typecheck strict du helper : `pnpm exec tsc --allowJs --checkJs --noEmit --strict --target ES2022 --module NodeNext --moduleResolution NodeNext --skipLibCheck --types node scripts/ci-local-dependencies.mjs`, code 0, `/tmp/vibecore-ci-ports-typecheck-final.log`. ESLint des quatre fichiers JS/TS touchés : zéro diagnostic, `/tmp/vibecore-ci-ports-eslint-final.log` ; aucun lint global revendiqué. Les validateurs existants `validate-ci-cd-assets.mjs` et `release-gate/validate-deploy-gate-wired.mjs` passent, journaux `/tmp/vibecore-ci-ports-{ci-assets,release-gate}.log`. Une comparaison structurée des trois workflows avec la base confirme 42 étapes hors bootstrap inchangées, ainsi que les contrôles de jobs, triggers, permissions et concurrence ; `/tmp/vibecore-ci-ports-controls-proof.json`. Index régénéré par le générateur officiel, 428 entrées. Aucun build applicatif ni capture UI requis ou exécuté pour ce changement limité au bootstrap CI.

## Revalidation après rebase

Le 18 octobre 2026 à 20:29 UTC, la branche est rebasée sur `c6439da55bebf180fe43dce65dbc5c32e6a9fa0a`, après fusion de #735. Seul l'index dérivé est en conflit : la version de la nouvelle base sert de point de départ, puis `node scripts/migrer-inventaire-bugs.mjs --index` le régénère depuis les fiches, **430 entrées**. Aucun fichier dérivé n'est fusionné à la main. Les huit fichiers CI/helper/tests du correctif restent identiques octet pour octet à `edc14ba6d0a82d20a8f4e31d83ee505d1a98ccf6` ; les quatre fichiers de configuration CI concernés sont aussi inchangés entre l'ancienne et la nouvelle base. La preuve Docker initiale porte donc sur le même code ; elle n'est pas réexécutée et aucune nouvelle preuve GitHub ou production n'est revendiquée.

La même commande ciblée repasse **59/59 tests, cinq fichiers, zéro skip**, un worker, **17,35 s** ; `/tmp/vibecore-ci-ports-rebase-tests.log`. Mémoire cgroup avant suite : **5 064 691 712 octets**, limite 16 Gio. Typecheck strict du helper : code 0, `/tmp/vibecore-ci-ports-rebase-typecheck.log`. ESLint des quatre fichiers JS/TS : **zéro erreur, zéro avertissement**, `/tmp/vibecore-ci-ports-rebase-eslint.json`. Les deux validateurs CI et câblage du gate restent verts, `/tmp/vibecore-ci-ports-rebase-{ci-assets,release-gate}.log`. Aucun build applicatif, navigateur, suite SQL, Docker, push ou nouvelle PR pour ce rebase.

## Limites

Le propriétaire historique de 55432 sur les runners GitHub demeure inconnu. Le test local crée son propre témoin ; il ne reproduit pas l'identité du processus original. Redis et Mailpit ne sont pas démarrés dans l'essai Docker local : leurs publications sont couvertes par le harnais, le Compose et les healthchecks, pas par une preuve d'exécution de ces deux images. Aucun fournisseur IA, envoi d'email, paiement, donnée client ni ressource cloud utilisé. Ce correctif n'est pas encore exécuté dans GitHub Actions, fusionné ou livré ; aucun état live n'est coché.

Coordination locale : la création/suppression des réseaux Docker a coïncidé avec un replay Chromium mené par le parent sur le même environnement. Celui-ci a observé `ERR_NETWORK_CHANGED` sur 11 assets locaux et a arrêté ce replay pour le reprendre après stabilisation. Ce replay ne prouve donc pas un défaut produit ni la panne CI initiale. L'essai Docker doit être exécuté sans navigateur concurrent sur le même hôte ; il est volontairement opt-in et ne fait pas partie de la suite Vitest ordinaire. Aucun nouveau réseau n'a été créé ou supprimé après ce constat.
