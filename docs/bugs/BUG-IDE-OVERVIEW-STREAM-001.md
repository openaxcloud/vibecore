---
id: BUG-IDE-OVERVIEW-STREAM-001
section: "IDE — initialisation et persistance"
---

## Bug

Le loader overview attend le projet avant de créer son flux SSE. Si le client
part pendant cette attente, son signal est déjà annulé : le listener ajouté
ensuite ne reçoit aucun événement et le polling démarre quand même. Une
annulation synchrone pendant le premier chargement laisse aussi un intervalle.
Le cancel du lecteur ne retirait pas le listener abort.

## 📤 Dispatché

☑ — 21 octobre 2026, diagnostic des E2E Monaco et restauration du layout.

## 💻 Codé

☐ — candidat local : contrôle du signal déjà annulé, nettoyage commun
idempotent pour abort/cancel/échec enqueue, intervalle installé avant premier
chargement. Fréquence et délais inchangés ; aucun changement API Git ni CI.

## ✅ Testé live

☐ — régression exécutant la vraie fonction extraite par AST : trois échecs
avant correction sur quatre cas. Vérification navigateur après correction
encore requise. Avant correction, 90 requêtes API/15 s après fermeture de tous
les navigateurs ; arrêt du frontend supprime la rafale. Profil API chargé :
5,51 s/15,50 s dans spawn de commandes Git. Ce mécanisme ne suffit pas encore
à attribuer tous les échecs E2E au flux overview.
