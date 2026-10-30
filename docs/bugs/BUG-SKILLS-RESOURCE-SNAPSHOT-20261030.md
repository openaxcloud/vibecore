---
id: BUG-SKILLS-RESOURCE-SNAPSHOT-20261030
---

# BUG-SKILLS-RESOURCE-SNAPSHOT-20261030

P1 — Une skill demandant une référence annexe pouvait être sélectionnée sans disposer du contenu nécessaire. L'ancien libellé promettait un chargement qui n'existait pas.

📤 Dispatché : ☑ 30/10 — audit Skills parallèle demandé par le propriétaire.
💻 Codé : ☐ sur main — complément isolé à #865 : références textuelles bornées, audit collectif, snapshots persistés et vérifiés, injection L3 et aperçu texte ; aucune fusion.
✅ Testé live : ☐ production — tests isolés HTTP/Prisma/SDK intercepté et navigateur compilé 390/820/1280 ; recette production distincte après livraison.

Preuves, limites des ressources prises en charge et protocole : [rapport L3](../qa/skills-l3-20261030/README.md). Aucun appel IA payant, aucune installation/exécution de skill tierce, aucune permission persistante ajoutée. Ne pas qualifier toutes les skills de pleinement fonctionnelles : scripts, binaires et dépendances externes restent exclus.
