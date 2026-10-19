---
id: BUG-DESKTOP-ELECTRON-MIRROR-001
section: "2026-10-18 — Vérification avant commercialisation"
---

## Bug

P2 — Les packages Desktop échouent au téléchargement d’Electron 42.0.0 depuis le miroir npmmirror imposé par `electron-builder.yml`. Les trois systèmes échouent sur la première tête de #740, après compilation du renderer et du processus principal ; le même HTTP 504 est reproduit sur la tête corrigée de typage. La cause interne au miroir n’est pas connue.

## 📤 Dispatché

📤 Pris en charge le 18/10/2026 dans le lot #740 pour rétablir ses contrôles de livraison, sans ouvrir une troisième PR.

## 💻 Codé

☑ Fusionné dans main par [#740](https://github.com/openaxcloud/vibecore/pull/740), `bb70c7b68`, le 19 octobre à 00:44:41 UTC. Livraison refusée par le gate E2E à 01:10:27 UTC ; non attesté en production.

Correction : retrait du seul bloc `electronDownload.mirror`. Le résolveur existant revient aux releases officielles GitHub ; versions, lockfile, TLS, proxy et contrôles CI restent identiques. Aucun retry global ou fallback ajouté.

## ✅ Testé live

☐ Les builds et uploads Windows/macOS/Linux passent en CI sur `af2badd`, run `39177237725`. Aucun test d’installation utilisateur, release publiée ou production revendiqué ; la fusion et les contrôles du nouveau SHA restent requis.

## Preuve

- [Échecs, configuration, métadonnées officielles et limites](../reprise/mesures/2026-10-18-desktop-mirror.json). Les trois archives officielles exactes existent, non draft/non prerelease, avec digest SHA256 dans les métadonnées GitHub. Aucun binaire téléchargé localement.
- Le YAML est parsé et le reste de sa configuration comparé égal. Builds locaux main/preload et smoke test inchangé réussis ; premier smoke refusé faute de ces artefacts, puis exécuté après compilation. Aucun rebuild renderer local ni packaging prétendu.
- Limite de sécurité conservée : `app-builder-bin5.0.0-alpha.12` passe un checksum vide à son téléchargement Electron. Le retrait du miroir n’ajoute donc pas de vérification cryptographique automatique des ZIP ; il ne désactive aucun contrôle existant.
- [Résultats CI du packaging et limites](../reprise/mesures/2026-10-18-pr740-ci-test-harness.json).
