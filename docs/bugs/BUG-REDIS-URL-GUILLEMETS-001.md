---
id: BUG-REDIS-URL-GUILLEMETS-001
---

## Bug

**P1 — une URL d'environnement CITÉE n'échoue pas : elle est JETÉE, et remplacée par un défaut plausible.** Le port configuré disparaît, le client part sur `localhost:6379`, et rien ne le dit.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐ — mesuré dans CE bac à sable ; la forme de la valeur en production n'a pas pu être vérifiée (passerelle 403)

## Preuve

**MESURÉ, pas déduit, avec `ioredis` réel :** `new Redis('redis://127.0.0.1:56379')` → `host=127.0.0.1 port=56379` ; `new Redis('\"redis://127.0.0.1:56379\"')` → **`host=\"localhost\" port=6379`**. Ce n'est pas un échec de connexion, c'est un REMPLACEMENT : l'URL configurée est jetée, le port avec elle. **Pourquoi c'est si difficile à voir** : le repli d'ioredis (`localhost:6379`) est exactement ce qu'on lirait si la variable n'était pas posée du tout. Un exploitant conclut « pas configuré » sur une variable qui l'est. Et côté worker le piège est double — `process.env.REDIS_URL ?? 'redis://localhost:6379'` : le `??` ne voit qu'une chaîne non nulle, garde la valeur citée, et ioredis retombe ensuite sur la MÊME adresse que le repli codé. Les deux replis coïncident, donc rien ne distingue « mal configuré » de « configuré en local ». **CONSTAT DANS CE BAC À SABLE** : `REDIS_URL` est présente, 65 caractères, et commence ET finit par un guillemet (vérifié par forme et longueur, jamais par la valeur — règle 12). D'où les `connect ENOENT %22redis-…%22` qui traînaient dans les journaux de la suite `services/api`, et la suite qui s'enlisait sur des délais réseau. **HUIT LECTEURS corrigés**, tous ceux des deux paquets : sonde de santé admin, courtier de collaboration, plafond de débit partagé, sonde `/ready`, drapeau `redisPubSub` annoncé au client, file de déploiement, `startWorkers`, `enqueue-cli`. Deux d'entre eux DÉCIDAIENT sur la variable nue tout en s'y connectant autrement : le plafond « partagé » s'annonçait actif en ne partageant rien, et `redisPubSub: true` promettait au client un temps réel qui ne publiait nulle part. **CE QUE LE CORRECTIF FAIT** : il retire la paire de guillemets pour que la plateforme fonctionne, ET le signale une fois par variable — réparer sans le dire remplacerait un défaut silencieux par un autre. L'avertissement ne porte que le NOM de la variable, jamais sa valeur : une URL de connexion contient souvent un mot de passe (règle 12), et le test le vérifie par l'ABSENCE. **CE QU'IL NE FAIT PAS** : un guillemet ORPHELIN est laissé tel quel — ce n'est pas le défaut mesuré et on ne devine pas l'intention. **DUPLICATION ASSUMÉE** : `services/api/src/env-url.ts` et `services/worker/src/env-url.ts` sont jumeaux. Les deux paquets ne partagent que `@vibecore/database` et `@vibecore/security`, dont aucun n'est un toit raisonnable pour de la lecture d'environnement ; une dépendance inter-paquets pour douze lignes est un risque de construction supérieur au bénéfice — et j'ai déjà cassé la construction une fois aujourd'hui en sous-estimant une frontière de module. Chaque copie porte SA garde. Contre-épreuve dans les deux sens des deux côtés (lecture nue réintroduite → rouge ; état corrigé → 13 verts côté api, 8 côté worker). épinglé par `services/api/src/env-url.spec.ts` et `services/worker/src/env-url.spec.ts` — chacun avec un contrôle positif (les fichiers ont bien été lus) et une garde « aucune lecture nue » qui vise LA RÈGLE, pas les huit occurrences du jour.

