---
id: BUG-IDE-URL-MEMORY-HANDOFF-20261111
section: "Promotion IDE locale du 11 novembre 2026"
---

# Hydratation URL, mémoire et transfert de disposition

## Bug

Une ouverture automatique depuis l’URL pouvait empêcher le retour de la disposition enregistrée, être rejouée dans un panneau nouvellement ciblé ou fuiter entre workspaces.

## 📤 Dispatché

Préparé localement le 11 novembre 2026. Publication non effectuée.

## 💻 Codé

Candidat local uniquement. Ni commit publié, ni fusion dans main.

## ✅ Testé live

Non validé live. CI complète, build, typecheck et recette responsive restent à vérifier.

## Correction et périmètre

État React unique pour arbres réel/provisoire; UUID alloué avant updater. Instantanés publiés en phase commit. Reçu de navigation provisoire transmis entre coquilles. Portée projet/workspace/fenêtre. Garder les gestes utilisateur et les flottants; ne pas réouvrir la même URL à un changement de focus.

Base exacte : `aea6e1dfbac93eb9da097a27d0ac8eb5ffbb7fc5` (PR894). Les résultats de PR893 ne constituent pas une acceptation de ce portage.

## Vérification locale

`app/components/chat/project-layout-url-restore.spec.tsx` : 22 cas sur les vrais blocs de production et la vraie mémoire main, plus 5 cas handoff et 5 cas restore. Les suites natives catalog (22) et search-startup (15) restent inchangées.

Sources de produit revues : PR893 jusqu’à `014cf3a4790ef421936f0aaec92bdff6b2f158a0`; correction de câblage de test reprise de `16636768acb8365f4ec64ab6657b10eeaac42e7d` quand applicable. Aucun workflow k3s/gVisor, exemption de clé payante, seed temporaire ou audit GCS actif importé.
