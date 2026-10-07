---
id: BUG-SEC-ADMIN-TEST-RUNTIME-001
---

## Bug

**P1 — le moteur de test est livré dans l’image admin.** `apps/admin/package.json` classait `vitest` dans les dépendances de production. Le SBOM `admin.cdx.json` du déploiement `37606222957` sur `916e23d8e1c4` confirme `vitest@3.2.6` et `tinypool@1.1.1`. Ce déploiement a échoué au scan de vulnérabilités avant le rollout. La garde d’élagage existante identifie `tinypool` comme une entrée atteignable, donc conservée tant que vitest reste une dépendance de production.

## 📤 Dispatché

📤 Correction prise en charge le 07/10/2026.

## 💻 Codé

💻 Fusionné sur main par #679 le 07/10/2026, commit `b06899dc85fba91eb54146027f5b20a50d440a5a`. CI, E2E, sécurité, qualité et Electron verts sur la branche avant fusion. `vitest` déplacé vers `devDependencies`, version résolue conservée dans le lockfile. Garde : `tests/guards/admin-dependances-production.spec.ts`, qui exécute une vraie installation de production hors ligne avec l’importeur admin du lockfile et l’élagage Docker, avec témoin positif et absence de vitest/tinypool.

## ✅ Testé live

☐ Non confirmé. Exiger le scan des nouvelles images puis le rollout et les vérifications de production sur le commit fusionné. Aucune exception Trivy ajoutée.

## Validation locale

Construction admin (`tsc --noEmit && vite build`) réussie. Test de production isolé réussi : vitest/tinypool absents, Vite présent comme témoin positif. Contrôles CI/CD et services Helm construits réussis. Le test initial `pnpm deploy --offline` échouait sur des métadonnées absentes de `@webcontainer/api`, sans rapport avec l’admin ; cette limite locale ne vaut pas preuve d’un build Docker réussi.
