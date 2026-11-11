---
id: BUG-IDE-PANE-RESTORE-20261111
section: "Promotion IDE locale du 11 novembre 2026"
---

# Identité des panneaux restaurés

## Bug

La normalisation remplaçait les identifiants des feuilles par pane-main, faisant perdre la cible active et l’identité distincte des panneaux restaurés.

## 📤 Dispatché

Préparé localement le 11 novembre 2026. Publication non effectuée.

## 💻 Codé

Candidat local uniquement. Ni commit publié, ni fusion dans main.

## ✅ Testé live

Non validé live. CI complète, build, typecheck et recette responsive restent à vérifier.

## Correction et périmètre

Conserver les identifiants valides. Réparer uniquement les identifiants vides, absents ou dupliqués, sans voler un identifiant ultérieur. Préserver onglets répétés et sélection active; aucune déduplication des onglets.

Base exacte : `aea6e1dfbac93eb9da097a27d0ac8eb5ffbb7fc5` (PR894). Les résultats de PR893 ne constituent pas une acceptation de ce portage.

## Vérification locale

`tests/guards/ide-pane-restoration.spec.ts` : 10 cas exécutent la vraie normalisation et les opérations de layout main, y compris les onglets volontairement répétés.

Sources de produit revues : PR893 jusqu’à `014cf3a4790ef421936f0aaec92bdff6b2f158a0`; correction de câblage de test reprise de `16636768acb8365f4ec64ab6657b10eeaac42e7d` quand applicable. Aucun workflow k3s/gVisor, exemption de clé payante, seed temporaire ou audit GCS actif importé.
