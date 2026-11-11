---
id: BUG-SECRETS-FORM-HANDOFF-001
section: "Promotion IDE locale du 11 novembre 2026"
---

# Formulaire Secrets perdu au remplacement de coquille

## Bug

Le formulaire Secrets et les champs non enregistrés disparaissaient quand la coquille de chargement était remplacée.

## 📤 Dispatché

Préparé localement le 11 novembre 2026. Publication non effectuée.

## 💻 Codé

Candidat local uniquement. Ni commit publié, ni fusion dans main.

## ✅ Testé live

Non validé live. CI complète, build, typecheck et recette responsive restent à vérifier.

## Correction et périmètre

Seuls les champs saisis, l’ouverture et le jeton de soumission restent en mémoire dans le provider de route, porté par projet/workspace/fenêtre/panneau. Aucun secret révélé, stockage navigateur, cache réseau ou télémétrie. Annulation, départ de route et succès sans modification effacent les valeurs. Le vrai chemin terminal transmet aussi paneId à ProjectTerminalPanel puis ProjectSecretsPanel; les deux callbacks réels retournent succès ou échec; une réponse ancienne ne détruit pas un nouveau brouillon.

Base exacte : `aea6e1dfbac93eb9da097a27d0ac8eb5ffbb7fc5` (PR894). Les résultats de PR893 ne constituent pas une acceptation de ce portage.

## Vérification locale

`app/components/chat/ProjectSecretsPanel.handoff.spec.tsx` : 34 cas React, dont coquille chaude/froide, StrictMode, isolation, annulation/réouverture, requête en cours, succès, HTTP négatif, enveloppe d’erreur et rejet réseau. Le refactoring ProjectMetadataForm de la branche de test n’existe pas dans main et n’est pas importé; son cas dédié est hors périmètre. Un cas supplémentaire exécute le composant terminal extérieur et les deux transmissions JSX réelles de paneId, puis vérifie remplacement de coquille et isolation entre panneaux. Les 13 tests existants IdeSettingsDraftState et les 8 gardes de câblage sont conservés; seule l’attente ajoutPossible exige aussi !formulaire.pending.

Sources de produit revues : PR893 jusqu’à `014cf3a4790ef421936f0aaec92bdff6b2f158a0`; correction de câblage de test reprise de `16636768acb8365f4ec64ab6657b10eeaac42e7d` quand applicable. Aucun workflow k3s/gVisor, exemption de clé payante, seed temporaire ou audit GCS actif importé.
