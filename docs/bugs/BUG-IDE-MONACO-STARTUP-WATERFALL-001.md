---
id: BUG-IDE-MONACO-STARTUP-WATERFALL-001
section: "IDE — initialisation et persistance"
---

## Bug

L'éditeur desktop ne commence à importer Monaco qu'après l'arrivée et la
sélection d'un fichier. À froid, cette attente en série laisse le conteneur
sans widget alors que l'arbre et l'onglet README sont déjà prêts. Sur le build
production de main `4af4dd1a`, `ide-floating-file-tabs` échoue trois fois à la
ligne 63 avant les gestes flottants, avec Chromium système dans cet environnement.

## 📤 Dispatché

☑ — 21 octobre 2026, reprise indépendante des deux E2E bloquants.

## 💻 Codé

☐ — candidat non fusionné : préchargement dès l'évaluation de la route IDE desktop, avant React et parallèle
à l'hydratation des fichiers ; promesse partagée avec les montages de widgets,
réinitialisée après rejet. La création des modèles et leur synchronisation
restent dans le widget. Pas de changement des délais/assertions/exemptions E2E.

## ✅ Testé live

☐ — production non testée. Le test unitaire d'import retardé a échoué sur le
premier candidat (promesses distinctes), puis les quatre tests Monaco ont passé
après partage de la promesse. La validation navigateur du candidat reste requise.

## Preuve et limites

Voir [le rapport de reprise](../reprise/2026-10-21-monaco-layout.md) pour les
horodatages, traces et différences avec la CI. Ce défaut est distinct de
`BUG-IDE-MONACO-CONTENU-INITIAL-001` : ici le widget manque ; ce n'est pas un
widget affichant le contenu d'un ancien modèle. Le préchargement est un candidat
à valider par les E2E, pas une justification pour élargir leurs attentes.
