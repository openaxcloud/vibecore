---
id: BUG-IDE-DELETE-SELECTION-RACE-001
---

# Une suppression différée remplace une sélection plus récente

## 📤 Dispatché

Résidu préexistant identifié pendant la revue #771 : suppression fichier/dossier en attente, sélection d’un autre fichier du même projet, puis réponse réussie qui sélectionne le premier fichier.

## 💻 Codé

Corrigé dans la consolidation, non intégré à main : la sélection est relue après la réponse, sous les gardes de projet et URL existantes. Aucun changement de suppression backend.

## ✅ Testé live

Non certifié live. Deux contre-épreuves rouges fichier/dossier, vertes après correction ; deux contrôles conservent le repli attendu quand le fichier supprimé reste sélectionné. Runtimes synthétiques, aucune suppression de données réelles. [Preuves et limites](file-isolation-consolidation-2026-10-22/README.md).
