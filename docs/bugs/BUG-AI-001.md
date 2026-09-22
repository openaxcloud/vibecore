---
id: BUG-AI-001
---

## Bug

**P0 — la generation IA etait MORTE en production : chaque appel s'auto-annulait.** Le garde-fou anti-gaspillage tuait ce qu'il devait proteger.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **CORRIGE, en attente de livraison**

## Preuve

Les routes cablaient `request.raw.on('close', () => abortController.abort())` pour annuler l'appel fournisseur payant si le client part. Or sous Node, `close` sur la requete ENTRANTE se declenche quand le flux de requete est CONSOMME, pas seulement a la deconnexion : pour un POST dont Fastify a deja bufferise le corps, c'est immediat. **Mesure du 01/09, meme pod, meme processus, meme instant, meme corps** : appel direct a `gateway.complete()` = SUCCES en 1182 ms ; le meme corps via la route HTTP = **500 en 98 ms**. En rejouant `complete()` avec un signal avorte apres 50 ms : `AbortError` en 66 ms **sans `statusCode`** — donc mappe en 500 generique. La signature correspond. **Branche streaming touchee plus gravement** : HTTP **200, zero morceau produit, zero octet** — un succes apparent au contenu vide, sans erreur ni journal ni metrique. **4 sites d'appel** portaient le defaut ; les 4 sont corriges. Le bon signal est la REPONSE : `close` sur la reponse avec garde `!writableEnded`.

