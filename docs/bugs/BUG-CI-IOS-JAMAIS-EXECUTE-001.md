---
id: BUG-CI-IOS-JAMAIS-EXECUTE-001
---

## Bug

**P1 — LE MOTEUR DE SAFARI iOS N'ÉTAIT TESTÉ NULLE PART, alors que la garde écrite pour lui existait.** `playwright.config.ts` déclare un projet `webkit-iphone` (profil iPhone 15 Pro) restreint aux QUATRE specs dont le sujet EST une interaction tactile — `agent-message-density`, `agent-scroll-pill`, `agent-composer-panel-viewport`, `ide-touch-targets`. Son commentaire cite le cas qui l'a fait naître : une barre d'actions révélée par `:focus-within`, VIVANTE sous Chromium et MORTE sous Safari iOS, « un vert sur une surface qui n'a pas le problème ». **Mesuré le 10/09 : ce projet n'était exécuté NULLE PART.** `e2e.yml:193` et `:204` → `--project=chromium` ; `e2e-runtime.yml:144` → `--project=chromium` ; `i18n-live-audit.yml:251` → ses quatre shards sont Chromium ; et l'installation ne posait que `playwright install chromium`, donc WebKit n'était même pas présent. La garde écrite CONTRE le faux vert Chromium n'avait donc jamais tourné une seule fois. C'est la classe de défaut dominante de cette campagne — le correctif existe, rien ne l'exécute — appliquée à la garde elle-même, et elle porte précisément sur la plateforme d'Avi.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**Correctif** : le projet est exécuté dans le job E2E existant (dupliquer ses 218 lignes de pile locale aurait dérivé ; la pile est déjà debout, seul le navigateur manquait). WebKit est installé dans la même étape, sans pouvoir la faire échouer — une indisponibilité amont ne doit pas fermer la porte E2E de tout le monde. ⚠️ **NON BLOQUANT, DÉLIBÉRÉMENT** : ce pas n'a jamais été exécuté, son premier passage en CI EST sa vérification, et je ne peux pas le lancer depuis cette session (WebKit non installable derrière le proxy). Le rendre bloquant d'emblée risquerait de fermer la porte E2E sur un réglage que personne n'a vu tourner. Le résultat est écrit dans `$GITHUB_STEP_SUMMARY` pour qu'un rouge SE VOIE — un canari qu'on ne regarde pas ne vaut pas mieux que pas de canari. **À basculer en bloquant après quelques runs stables.** épinglé par `tests/guards/exports-de-route-et-portes-ci.spec.ts` (5 cas : le projet existe, AU MOINS UN workflow l'exécute vraiment, le navigateur est installé par ce workflow, les quatre specs existent). Contre-épreuve : exécution retirée → rouge sur « au moins un workflow l'exécute ». Sans ce cas, retirer l'étape ferait retomber la couverture iOS à zéro sans un seul rouge — l'état exact d'où l'on part. ⚠️ Effet de bord constaté et corrigé : insérer cette étape a décalé l'indice d'une dérogation d'épinglage d'actions (`steps[15]` → `[16]`) et **décâblé la garde de chaîne d'approvisionnement** ; la CI l'a attrapé en 35 s.

