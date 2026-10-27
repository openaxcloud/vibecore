---
id: BUG-AGENT-UI-EVIDENCE-RECEIPTS-20261027
section: "Génération et orchestration"
---

# Agent : afficher les confirmations reçues, pas la sélection ni les rapports comme preuve

## 📤 Dispatché

☑ 27/10 — complément UI du contrat backend #812, séparé du lot responsive #811.

## 💻 Codé

☐ sur main — correctif local préparé, publication et livraison encore attendues.

## ✅ Testé live

☐ — aucune recette fournisseur ou projet client ; validations locales synthétiques seulement.

## Défaut reproduit et périmètre

La surface AssistantMessage lisait le registre de fichiers sans abonnement : une confirmation tardive ou son invalidation ne déclenchait pas de recalcul. L'agrégat des sous-agents suffisait à afficher les écarts alors que le coordinateur pouvait encore écrire. Le texte de repli disait qu'une réponse avait été produite à partir d'une simple décision de routage ; Stop pouvait nommer Claude à partir de la sélection, sans reçu de sortie.

Ce complément consomme les preuves distinctes du [contrat backend](../runtime/agent-delivery-evidence.md), sans réimplémenter l'écriture ou ses protections. Le défaut de production des reçus est suivi séparément dans [BUG-AGENT-WRITE-RECEIPTS-20261026](BUG-AGENT-WRITE-RECEIPTS-20261026.md).

## Correctif local

- Abonnement à confirmationsEcritureVersion ; undefined reste inconnu, [] signifie observation sans confirmation. Comptage des chemins confirmés par relecture, sensible à la casse et réactif à l'invalidation.
- Alerte de livraison non confirmée différée tant que le streaming est actif. Aucune confirmation n'atteste une sauvegarde cloud, une compilation ou des tests QA.
- Notice de fallback limitée à la sélection. modelOutput exige evidence=text-delta et des champs valides ; dernier reçu pertinent, continuation et messageId respectés.
- Stop prend le modèle du dernier reçu du tour courant ou un nom neutre. Un nouveau message utilisateur coupe la recherche des reçus précédents.

## Validation et limites

[Preuves durables et scénario navigateur](ui-agent-evidence-2026-10-27/README.md). La base d'intégration inclut main #811, ses imports Settings, ses tooltips et son traitement Escape ; le delta de BaseChat se limite au lecteur de reçu et au libellé Stop.

Le streaming est le signal global existant du composant. Le registre est borné et peut être inconnu après rechargement ou éviction. Aucun badge « QA passée » ou « terminé » n'est déduit d'un rapport ou d'un delta textuel. Pas de changement de permission, fournisseur, publication, moteur runtime ou stockage client.
