---
id: BUG-IDE-PROJECT-FILE-SCOPE-001
---

# Le projet A affiche un document du projet B pendant son hydratation

## 📤 Dispatché

22 octobre 2026 : diagnostic séparé de #768/#769, branche investigate/desktop-back-transitions-20261022, base e4bda1fb. Transition B → A avec README.md homonyme. Ne pas confondre avec le flaky de navigation interrompue entre panneaux.

## 💻 Codé

Correction compilée `2023932ed96228ea1fe970af441ecff8b009736a`, non intégrée à main au moment de la recette. Le changement réel de propriétaire des fichiers doit invalider la map et les documents, même si l’adaptateur runtime garde la même identité. Le nettoyage puis remontage du même projet doit préserver son contenu. Aucun effacement de fichiers backend ou de mémoire persistée des projets.

## ✅ Testé live

Rouge contrôlé sur build réel local 838684f0, produit identique à e4bda1fb, API/PostgreSQL dédiés et fixtures synthétiques : après Back vers A, URL et routeur sont sur A au repos, mais le README initial de B est encore affiché tant que la vraie archive A est retenue. La continuation HTTP 200 rétablit TEMPORARY-README de A. Observation du singleton compilé : files, documents et currentDocument contiennent déjà B ; ce n’est pas seulement un cache visuel de l’éditeur. Deux contrôles rouges conservés, sans retry ni augmentation des assertions.

Cause isolée : configureProject(undefined) puis configureProject(A) ne vident pas les fichiers B ; configureRuntime retourne sans reset lorsque l’instance est identique. Restaurer README.md de A résout alors le même chemin dans la map de B.

La fenêtre de contenu incorrect est reproduite. Le timeout spontané CI à 768 px (PROJECT-B-DOCUMENT puis éditeur absent, succès retry1) n’est pas encore causalement attribué : le scénario exact local passe. Aucun résultat production, Safari, runtime fournisseur ou sauvegarde distante revendiqué. Le nouveau test suivi échoue sur baseline en 22,399 s, puis passe sur le correctif compilé : aucun contenu B pendant l’archive retenue, README de A après continuation. La recette finale comporte quatre succès directs, zéro retry/omission : retours 390/768, archive retenue 768 et contrôle de navigation interrompue entre panneaux. Les 34 tests unitaires passent. Les interruptions de runtime, événements WebSocket tardifs et écritures en cours ne sont pas certifiés par ces seuls gestes. [Preuves, captures et provenance](project-file-scope-2026-10-22/README.md).
