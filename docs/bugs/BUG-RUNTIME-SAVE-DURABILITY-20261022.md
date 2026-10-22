---
id: BUG-RUNTIME-SAVE-DURABILITY-20261022
---

# Sauvegarde runtime reconnue sans copie durable

## 📤 Dispatché

Correction API isolée depuis main 18745bd04f77e4d9fc6353d61bd4d17a3822f94e. PUT files/write et POST files avalaient les erreurs du manifeste ; son absence était aussi un succès silencieux.

## 💻 Codé

Branche fix/api-durable-runtime-save, non fusionnée. Refus sans manifeste complet, erreur explicite après succès runtime partiel, mutation unitaire avec relecture exacte et statut de persistance. Aucun fichier client ni projet réel modifié. Limites et proposition de précondition atomique dans services/api/RUNTIME_SAVE_DURABILITY.md.

## ✅ Testé live

Non testé en production. Tests locaux API avec agent HTTP simulé, pannes de persistance et ZIP serveur réel ; conservation des fichiers préexistants vérifiée. Revue indépendante à coordonner avant toute fusion. La concurrence runtime reste une proposition à implémenter côté agent ; aucune atomicité multi-systèmes annoncée.
