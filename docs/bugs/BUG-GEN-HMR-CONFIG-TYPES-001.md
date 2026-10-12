---
id: BUG-GEN-HMR-CONFIG-TYPES-001
section: "2026-10-12 — Revalidation locale A-37"
---

## Bug

Le post-traitement ESM de `vite.config.ts` par `ensureViteHmrConfig`
introduit TS7006 (`env` implicitement `any`) et, pour une configuration objet,
TS2349 (appel d'une valeur réduite à `never`). Une application dont le build
inclut cette configuration sous TypeScript strict ne compile plus après la
réparation de preview. Reproduit sur la base actuelle `e1ba08b68`, sans modèle
ni projet utilisateur ; ce n'est pas une déduction des publications du 1er octobre.

## 📤 Dispatché

☑ 12/10 — chantier local A-37.

## 💻 Codé

☐ Correctif local préparé et relu indépendamment ; aucun push ni fusion.

## ✅ Testé live

☐ Aucun test live. A-37 reste ouvert.

## Preuve et périmètre

[Rapport reproductible](../reprise/2026-10-12-a37-compilation-locale.md).
La nouvelle suite compile les configurations réellement produites par
`buildPreviewManifestRepair`, charge leur résultat avec Vite et construit une
application locale cohérente. Un export `MAX_HISTORY` retiré fait échouer le
compilateur : le test ne se contente pas de comparer des chaînes.

Le correctif donne un type contextuel à `env`, résout les configurations
objet/fonction/promesse avant fusion et migre les anciens wrappers reconnus.
Le wrapper API attend également cette résolution, faute de quoi il perdrait
les réglages utilisateur et le port HMR. Aucune option TypeScript n'est affaiblie.

Restent hors preuve : génération IA fraîche, typage strict complet du middleware
API injecté, configs CommonJS, installation isolée des dépendances des gabarits
de galerie, runtime distant, aperçu et publication live. Les erreurs historiques
« process sans types Node » et « MAX_HISTORY absent » ne sont pas établies comme
défauts des gabarits actuels par cette vérification.

## Suite locale CommonJS et galerie

La [suite du 12 octobre](../reprise/2026-10-12-a37-commonjs-et-galerie.md)
reproduit puis corrige la perte de réglages CommonJS async/promesse, le typage du
wrapper et la découverte `.cjs`/`.cts`. Elle couvre aussi `export default` dans
un `.cts` et les migrations. Elle succède aux réserves CommonJS du premier lot,
sans modifier sa preuve ni déclarer de validation live. Les compilations réelles
de galerie utilisent le graphe restauré, avec écarts de versions documentés :
elles ne certifient pas les installations exactes. Les six diagnostics globaux
sont archivés intégralement. A-37 et le typage complet du middleware API restent
ouverts.
