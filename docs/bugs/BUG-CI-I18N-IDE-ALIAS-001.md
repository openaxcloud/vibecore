---
id: BUG-CI-I18N-IDE-ALIAS-001
---

## Bug

P1 livraison — l'audit i18n exige la bascule globale sur l'alias preview qui redirige vers la coque IDE, où elle a été retirée par décision produit. Les logs du run `37760209216` relèvent aussi la copie Bitbucket « workflows », le nom d'une fixture française avec suffixe aléatoire pris pour anglais, et l'auteur Git « You » traité comme texte UI.

## 📤 Dispatché

☑ Pris en charge le 08/10/2026 après lecture des journaux desktop-1024 et desktop-1440.

## 💻 Codé

☐ Sur branche de #681. Le test classe preview avec ide/git et conserve son invariant inverse (absence de bascule), ainsi que tous les contrôles locale/visuels. Fixture française sans fragments aléatoires. Copie Bitbucket corrigée. Messages et auteurs Git marqués contenu utilisateur, sans modifier l'histoire Git ni exclure les libellés de l'interface.

## ✅ Testé live

☐ Non confirmé en production. 102 tests ciblés locaux passent ; la matrice complète de quatre formats doit passer sur le nouveau SHA puis être rejouée sur la release réellement déployée.

## Validation

`tests/i18n/audit-shell-path.spec.ts` teste trois routes IDE, quatre contre-exemples et les descriptions FR avec le vrai détecteur de résidus. `tests/i18n/live-audit-heuristics.spec.ts` conserve 60 cas positifs/négatifs ; `tests/guards/i18n-bascule-repliee.spec.ts` conserve les exigences responsive. L'E2E `tests/e2e/i18n-french-live.spec.ts` utilise le même classifieur et examine le rendu complet. Aucun skip de route ajouté.
