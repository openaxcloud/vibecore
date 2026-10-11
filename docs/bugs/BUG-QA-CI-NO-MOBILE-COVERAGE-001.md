---
id: BUG-QA-CI-NO-MOBILE-COVERAGE-001
---

## Bug

**P1 — Aucun signal automatisé à la largeur iPhone : le seul job CI qui teste en 390 px n'aboutit jamais, et l'étape E2E « mobile » n'exécute que 2 tests sur 21, aucun à une largeur de téléphone.** **(1) `i18n-live-audit.yml`** est le seul workflow avec une matrice de viewports (`desktop-1440`, `desktop-1024`, `tablet-768`, `mobile-390`). Sur les runs des 24 et 25/08, **`Playwright mobile-390` est `cancelled` à chaque fois** pendant que les 3 autres viewports passent en `success`. Cause : `timeout-minutes: 90` atteint — run `32873413018` démarré à 16:41:00, terminé à 18:12:06 = **91 min** ; l'étape « Run exhaustive EN/FR live audit » est annulée, puis « Verify complete proof set » échoue. Le shard 390 ne produit donc **aucune preuve**, alors que `tablet-768` en produit. **(2) `e2e.yml:141`**, étape nommée « Playwright mobile viewport tests », lance `tests/e2e/responsive-ide.spec.ts` avec **`--project=chromium`** (Desktop Chrome, 1280×720, `isMobile:false`). Or les tests sont gardés par `test.skip(!isMobile, …)` et `test.skip(!isCompactIdeProject(testInfo), …)` avec `isCompactIdeProject = project.name === 'mobile' \

## 📤

\

## 💻

'tablet'`. Décompte sur `origin/main` : **21 tests** → 3 exclus par `--grep-invert @runtime`, **16 ignorés** par ces gardes (7× `!isMobile`, 9× `!isCompactIdeProject`), **2 réellement exécutés** — `tablet exposes icon-only tab navigation…` et `tablet landscape uses the compact mobile IDE shell`, **tous deux en 1024×768 uniquement**. **Aucun `--project=mobile` ni `--project=tablet` n'existe dans aucun workflow** (`git grep -- '--project=' .github/workflows/` → seulement `chromium`, plus la matrice i18n). **(3)** Le projet Playwright `mobile` est **Pixel 7 (412×915, UA Android)** : même s'il était lancé, il ne couvrirait ni la largeur **390** ni **WebKit/iOS**. Conséquence : les régressions responsive à largeur iPhone — débordement horizontal, cibles tactiles < 44 px, panneaux tronqués — **ne peuvent pas être détectées par la CI**. C'est précisément le format de test principal d'Avi.

## ✅

☐

## Preuve

☐

