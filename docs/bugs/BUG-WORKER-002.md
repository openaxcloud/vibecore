---
id: BUG-WORKER-002
---

## Bug

**P3 — `enqueue()` ne valide pas le nom de la file : une CronJob mal configurée empile silencieusement dans une file inexistante au lieu d'échouer.** La garde `Unknown queue '…'. Known queues: …` vit dans `parseArgs()` (`services/worker/src/enqueue-cli.ts:61`), **pas** dans `enqueue()` (ligne 68), qui accepte n'importe quel nom et crée la `Queue` BullMQ telle quelle. Tout appelant qui construit l'objet `Parsed` sans passer par le parseur contourne donc la validation.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**LE TEST CENSÉ COUVRIR CE CAS PASSAIT — POUR LA MAUVAISE RAISON, et c'est la trouvaille du point.** Il visait `redis://127.0.0.1:6379`, où rien n'écoute, et n'exigeait qu'un rejet SANS MOTIF : c'est l'échec de CONNEXION qui le rendait vert. Rebranché sur un Redis joignable, le même appel **RÉSOUT** et rend l'identifiant de job `"1"` — la file inexistante avait bel et bien reçu le travail. La garde vit désormais dans `assertKnownQueue()`, appelée par `parseArgs()` ET par `enqueue()`, **avant même la lecture de `REDIS_URL`** : une file inconnue est une erreur de configuration, pas un incident d'infrastructure. Le test exige maintenant le MESSAGE exact et n'a plus de `REDIS_URL`, donc il ne peut plus emprunter le chemin de l'infra ; un contrôle positif vérifie qu'une file CONNUE franchit bien la garde, sans quoi une garde trop stricte resterait verte. **Contre-épreuve en deux temps, la seconde étant la vraie démonstration** : garde retirée → mon test rougit (2 échecs) ; garde retirée AVEC L'ANCIEN TEST → **5/5 verts**. L'ancien ne valait rien. épinglé par `services/worker/src/enqueue-cli.spec.ts`

