---
id: BUG-EDITOR-FOCUS-REGISTRATION-20261029
section: "Agent et messages"
---

# Éditeur focalisable avant son inscription au transfert de focus

## 📤 Dispatché

☑ 29/10 — blocage CI de #854 ; reproduction déterministe de la fenêtre d'inscription.

## 💻 Codé

☐ — correctif sur branche séparée, non fusionné.

## ✅ Testé live

☐ — aucune recette production du correctif.

## Preuves

La première CI de #854 échoue dans `desktop-editor.spec.ts:971`, scénario
`owns a deferred editor destination until resolved`, avec `mobile.hasFocus`
faux au lieu de vrai. 11 260 tests passent, un échoue, quatre sont ignorés.
Les étapes d'intégration et de build placées après les unitaires ne sont pas
exécutées. Le contrôle n'est ni supprimé ni relâché.

Le fichier complet passe localement 44/44 sur la tête et sur sa base : cela ne
prouve pas l'absence du défaut. Une reproduction contrôlant l'apparition du vrai
composant avec l'adaptateur Monaco de test, sans délai arbitraire ni remplacement
de React, expose la fenêtre : Monaco est créé et peut être focalisé avant que
le rendu déclenché par `editorVersion` l'inscrive au registre. Si une autre
surface prend sa place dans cet intervalle, le transfert ne trouve aucun
éditeur focalisé et perd la réservation. La contre-épreuve donne un échec et
44 succès avant correction.

## Invariant

Un éditeur créé et focalisable doit déjà être inscrit au registre qui capture
son focus et sa sélection, sans attendre un rendu supplémentaire. Son retrait
et les changements d'identité doivent toujours retirer l'ancienne inscription,
sans reprendre le focus après une interaction utilisateur, une composition ou
un changement de projet.

## Correction et validation isolée

L'inscription suit immédiatement la création de Monaco ; les changements de
portée/identité remplacent l'inscription et un nettoyage tardif ne peut effacer
celle du nouvel éditeur. Le contrôle de restauration du focus reste inchangé.
80 tests passent dans les suites éditeur desktop/mobile et API de l'adaptateur.
La revue indépendante est favorable, avec 45 tests exécutés séparément. La
nouvelle régression garde les assertions exactes de focus et de sélection, sans
relâcher de seuil. Elle démontre une course réelle compatible avec le symptôme,
sans établir à elle seule toute la chronologie de l'exécution CI initiale.
