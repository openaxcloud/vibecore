---
id: BUG-AGENT-CHAINE-BORNE-001
---

## Bug

**P1.** La borne de la chaîne valait 12 min alors que son propre commentaire disait « la plus longue génération saine mesurée tenait 215 s, et huit segments peuvent légitimement s'enchaîner ». `attendre()` arme son délai UNE fois avant le premier segment et ne le ré-arme jamais : les 12 min couvraient les NEUF appels fournisseur — sous-dimensionnée d'un facteur 2,4 par sa propre prémisse. Sur dépassement, une progression terminale part au client qui appelle `stop()` : une génération SAINE coupée au milieu d'un fichier pendant que le fournisseur produit, et facture, dans le vide.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

borne désormais dérivée de `MAX_RESPONSE_SEGMENTS`, budget par segment posé dans le même fichier + épinglé par `app/routes/api.chat.identifiant-de-message-stable.spec.ts` (2 tests dédiés). Commit `1fd5956a4`. **DÉPLOYÉ EN PRODUCTION** le 2026-09-10 par le run 1597 de `deploy-main.yml` (SHA `e435692a1`, qui contient ces commits — vérifié par `merge-base` et par le comptage des marqueurs à ce SHA) : `Helm upgrade` 11:00:52→11:07:45, `Verify rollout` ✅, et surtout `Verify running imageIDs match the release manifest` ✅ — les pods qui tournent portent bien les images construites depuis ce commit ; l'étape de rollback est restée `skipped`. ⚠️ Le déploiement n'est PAS une vérification live : la colonne ✅ reste ouverte tant que le comportement n'a pas été constaté à l'écran.

