---
id: BUG-IDE-GLOBAL-PALETTE-LIFETIME-20261028
---

## Bug

La palette globale ouverte pendant l’initialisation peut disparaître au remplacement de PendingComposerShell par le Chat chargé : ouverture, recherche et référence de retour du focus étaient locales à BaseChat. Le test desktop1280 de main58fa0702 échoue pendant fill('Webview'), puis sur palette absente dans ses deux reprises. Un timeout au même endroit existait déjà après #799. Le défaut recoupe la partie palette de #768 non fusionnée ; sa reprise ciblée a été explicitement autorisée le28octobre2026 à10:02:32UTC, sans autoriser un contournement des contrôles.

## 📤 Dispatché

☑ 28/10/2026 — correction isolée de la durée de vie de la palette globale sur main58fa0702. Publication, promotion et livraison autorisées après validation, en coordination avec #822.

## 💻 Codé

☐ main — correctif local en validation. Aucun autre volet du lot #768 repris.

## ✅ Testé live

☐ production — aucune recette authentifiée production du correctif. Reproduction sur le vrai build local intact58fa0702 à1280/1440/1024 avec API synthétique neutre : réponse mémoire retenue puis libérée, ancienne coque et input détachés, palette disparue et focusBODY, zéro erreur page. Ce résultat confirme le mécanisme local mais ne remplace pas la trace CI inaccessible (archive présente, téléchargement bloqué HTTP403 dans l’environnement).

## Correction et preuves

État de palette globale conservé par le provider existant au-dessus des fallbacks, isolé par projet/fenêtre ; fermeture explicite et sortie de route restent définitives. Référence de focus conservée sans écrasement par un raccourci répété ; callback différé annulé si la coque disparaît ou la palette rouvre. La réouverture explicite garde le contrat existant de réinitialisation de la recherche. Tests existants, assertions, délais, retries et gates inchangés.

[Validation locale, captures, matrice et limites](global-palette-2026-10-28/README.md).
