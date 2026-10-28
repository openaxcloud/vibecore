---
id: BUG-CHAT-HISTORY-STALE-LOAD-20261028
section: "Agent et messages"
---

# Une lecture tardive du projet précédent remplace l'identité du fil actif

## 📤 Dispatché

☑ 28/10 — audit agent/historique demandé ; base `9ec6ebf75`.

## 💻 Codé

☐ — correctif isolé, pas intégré à main.

## ✅ Testé live

☐ — tests locaux synthétiques seulement ; aucun projet client modifié.

## Preuves et correction

Deux courses rouges reproduites sur le hook React réel : mémoire A résolue après
navigation vers B, et repli serveur A tardif alors que les deux conversations
n'ont pas encore d'identité. Elles réattribuaient chatId/métadonnées à A dans B.
L'effet invalide ses callbacks au nettoyage ; les résultats, rejets et callbacks
de repli obsolètes ne publient plus d'état ni d'adoption de conversation.
Les erreurs du projet actif continuent d'être signalées.

37 tests ciblés verts et revue indépendante favorable (19 tests rejoués).
Les lectures déjà lancées ne sont pas annulées. Aucune promesse de correction
pour des instances simultanées distinctes du chat ou une restauration déjà engagée.
Détails et limites : [reçu de validation](../qa/chat-history-stale-load-20261028.md).
