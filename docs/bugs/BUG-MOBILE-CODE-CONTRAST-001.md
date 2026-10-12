---
id: BUG-MOBILE-CODE-CONTRAST-001
---

## Bug

P2 — Sur `/mobile` en thème clair, le bloc CODE de Full-Featured Editor utilise une encre verte fixe trop claire : contraste 2,338688:1 à 12 px, sous le seuil AA de 4,5:1.

## 📤 Dispatché

☑ 12/10/2026 — correction minimale reconstruite sur `e1ba08b68c2e9ba82a838ca9c5dc8f0206fcac43`.

## 💻 Codé

☐ — remplacement local par `text-bolt-elements-code-text`, non fusionné sur `main`.

## ✅ Testé live

☐ — aucune validation en production ; hydratation publique hors périmètre.

## Preuve locale

Le test `app/components/marketing/mobile-code-contrast.spec.tsx` rend les vrais composants React de la page, avec la coquille publique préchauffée, les utilitaires UnoCSS et la feuille Sass du dépôt. Chromium compose les fonds alpha des ancêtres et calcule la luminance relative WCAG. Tout accès réseau du navigateur est bloqué.

Contre-épreuve sur le code antérieur de la base actuelle : à 390 px en clair, texte `rgb(167,243,208)`, fond composé `rgb(147.87,149.01,150.72)`, taille 12 px, ratio 2,3386884274:1 ; l'assertion AA échoue.

Le jeton sémantique existe déjà : UnoCSS pointe vers `--bolt-elements-code-text`, surchargé dans `app/styles/index.scss` par `--vc-ide-text-primary` (`#111827` en clair, `#f5f9fc` en sombre). Le changement ne modifie que le pré de `MobileFeatureDemo`.

Le test navigateur est ignoré si aucun Chromium local n'est disponible. Pour l'exécuter avec un navigateur installé, définir `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` ; aucune installation implicite. `CONTRAST_EVIDENCE_DIR` permet d'enregistrer les mesures et captures locales.

Après correction, les six combinaisons 390/768/1440 px × clair/sombre passent : **5,9144414911:1 en clair**, **17,9399478498:1 en sombre**, toujours à 12 px. Captures du panneau inspectées à 390 px. Ces résultats concernent le rendu local statique des composants, pas une session hydratée ni une validation live. Le ratio sombre n'est pas repris de l'ancien environnement absent.

## Reproduction hors ligne

Depuis la racine, avec les dépendances déjà présentes et conformes au lockfile :

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium node node_modules/vitest/vitest.mjs run app/components/marketing/mobile-code-contrast.spec.tsx
```

Adapter uniquement le chemin vers le Chromium local. La commande a été exécutée avec TypeScript 5.8.3, Vitest 3.2.6 et Vite 5.4.21 ; aucune restauration ou installation n'a été nécessaire. Le pnpm global est en version 11.25.0 alors que le dépôt fixe 9.14.4 : il n'a pas été utilisé pour les validations, exécutées directement avec les binaires du dépôt.

## Validation du lot

- Contre-épreuve avant correction : échec AA attendu et mesuré sur le code de la base courante.
- 39 tests ciblés passent : ce test navigateur, `marketing-product.spec.tsx`, `marketing-remaining.spec.tsx`, `theme-token-parity.spec.ts`.
- 6 tests de `scripts/index-a-jour.spec.mjs` passent avec Vitest.
- `node node_modules/typescript/bin/tsc --project tsconfig.web.json --noEmit --pretty false` : succès.
- `node node_modules/eslint/bin/eslint.js app` : succès, 0 erreur / 51 avertissements.
- `VITEST=1 NODE_OPTIONS=--max-old-space-size=8192 node node_modules/@react-router/dev/bin.js build` : succès client + SSR. `VITEST=1` évite de charger les fichiers d'environnement locaux ; le mode du build reste production.
- Relecture indépendante : aucun défaut bloquant ; limites du rendu statique et du navigateur facultatif confirmées.

Pas de suite monorepo complète, de runtime distant, d'appel IA, de déploiement ou de validation de l'hydratation. Les fusions #701 et #723 sont ancêtres de la base et ne sont pas modifiées par ce lot.
