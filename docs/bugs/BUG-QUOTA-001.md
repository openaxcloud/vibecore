---
id: BUG-QUOTA-001
---

## Bug

**P1 — le quota `terminals.concurrent` est décompté PAR CONNEXION WebSocket et non par SESSION de terminal, donc un rattachement consomme un second créneau et se fait rejeter en 429.** Révélé par la correction de BUG-TERM-002 : une fois les identifiants stabilisés, l'agent rattache bien la session existante — mais l'API, elle, compte la nouvelle connexion comme un terminal concurrent de plus. Sur un plan à **limite 1** (l'offre gratuite), la moindre reconnexion du même panneau est donc rejetée. Mesuré : **26× `429`** sur le seul `sessionId=terminal-user-0`, avec la jauge à **1** (somme de 29 `UsageEvent` `terminals.concurrent`, appariés +1/−1 correctement — **ce n'est pas une fuite de compteur**, la jauge est honnête : elle compte réellement une session ouverte, et refuse la reconnexion de cette même session). Le shell **managé** échappe au problème (`managed=1` le dispense du quota), ce qui explique qu'il soit le seul panneau utilisable.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 16/08**

## Preuve

Env d'audit, ws `ws-4ede79018e4587c6`, avec `web:6a12ccf210` (identifiants stables) et `api:59818de207`. Logs API sur 4 min : `sessionId=terminal-user-0` **×26 → toutes 429**, `sessionId=terminal-managed` **×4 → OK**. Jauge lue en base : `select type, sum(quantity) from "UsageEvent" where type='terminals.concurrent'` → **1** pour 29 événements. Pod : **1 seul shell** (le managé). Correctif attendu : clé de quota portant sur l'**identité de session** (`sessionId`) plutôt que sur la connexion — un reattach de la même session ne doit pas consommer un second créneau ; ou libérer le créneau à la fermeture du socket **avant** d'évaluer la nouvelle connexion. **Mécanisme exact lu dans le code** (`services/api/src/app.ts`, route `/terminal`) : à la connexion, si le terminal n'est pas `managed`, `withSerializedMutation('terminals:<org>')` enchaîne `ensureQuota(...,'terminals.concurrent')` puis `recordUsage(..., +1)` ; à la fermeture du socket, `recordUsage(..., -1)`. Le compteur est donc indexé sur la **connexion**, jamais sur la session : un rattachement au même `sessionId` ouvre un nouveau socket, donc redemande un créneau, alors qu'aucun terminal supplémentaire n'existe côté agent. Sur limite 1, si l'ancien socket n'est pas encore fermé (ou se ferme après), le `+1` du nouveau se heurte au `+1` de l'ancien → **429**. Le commentaire du code documente déjà la fuite inverse (gauge qui ne redescend jamais) et la corrige par le `-1` au close — mais pas ce cas-ci. **Conception du correctif** : porter la clé de quota sur l'**identité de session** — inclure `sessionId` dans les métadonnées de `recordUsage`, et avant le `+1` vérifier s'il existe déjà une entrée nette positive pour ce couple `(organizationId, sessionId)` ; si oui, il s'agit d'un rattachement : ne pas appeler `ensureQuota`, ne pas incrémenter, et ne pas décrémenter à la fermeture (sinon la jauge passerait négative). ⚠️ **Lot facturation/quota — consigné seulement en l'état.** Correction autorisée sur l'env de test pour débloquer la preuve, mais **à ne pas merger en prod avant revue expert** : toucher au décompte de concurrence a des effets de facturation.

