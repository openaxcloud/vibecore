---
id: BUG-RUNTIME-CI-FALSE-SUCCESS-20261108
section: "Déploiement et sécurité"
---

# Nightly runtime verte malgré dix-huit échecs

## 📤 Dispatché

☑ 08/11 — diagnostic demandé sur main af0ea860, run42446502089,
job128626431509. Dix-huit échecs réels, audit IDE sauté, workflow success.

## 💻 Codé

☐ — correction locale seulement : retirer continue-on-error du job, tenter
l'audit après la suite effectivement démarrée, ne pas injecter de clés IA
payantes dans cette nightly. Aucun test runtime supprimé ni assertion relâchée.
La suite reste distincte du gate de livraison production ; son verdict devient
honnête mais sa pile runtime n'est pas encore réparée.

## ✅ Testé live

☐ — trois contrats de configuration rouges avant, verts après ; aucune preuve
runtime navigateur ni production. Voir docs/qa/runtime-ci-20261108/README.md.

## Causes et limites établies

Le fallback de l'API ne démarre pas le manager et refuse les commandes background.
WORKSPACE_DEFAULT_RUNTIME_MODE ne configure que le workspace des tâches planifiées.
Le serveur manager existant utilise KubectlWorkspaceK8sClient. Les tests runtime
attendent aussi l'ancien bouton Workspace: running ; l'UI actuelle expose un
statut dans la barre d'état. Les attentes doivent être réconciliées par preuve
navigateur, pas simplement supprimées. Un scénario demande une génération IA :
il n'a pas été lancé, aucun budget pour cet essai n'étant autorisé ici.
