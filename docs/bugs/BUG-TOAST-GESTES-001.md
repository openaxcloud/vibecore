---
id: BUG-TOAST-GESTES-001
section: "Mesures sur vrais tours de production — 2026-09-28/29"
---

## Bug

**P2 — sur téléphone, le bandeau « 1 fichier appliqué » confisquait les gestes sur le haut du fil.** Complète BUG-TOAST-ENTETE-001 (#591) : le bandeau ne masque plus l'en-tête (posé à y=104), mais en pleine largeur et sur 174 px il se pose désormais sur le haut du fil et y captait tous les gestes — un appui long sur le premier message tombait sur le bandeau. C'est la cause de l'instabilité de `tests/e2e/ide-mobile-chrome.spec.ts` (« menu contextuel… », ligne 1309) depuis la vague #591, qui bloquait la file de fusion.

## 📤 Dispatché

☑ 29/09

## 💻 Codé

☑ #602 (`a9e99cbdc1`), servi le 2026-09-30 (bundle client : règle `…statusbar) .Toastify__toast{pointer-events:none}` présente) — `app/styles/index.scss` : le corps du bandeau laisse passer les gestes, ses commandes les gardent (même famille `body:has(.bolt-project-statusbar)` que BUG-TOAST-ENTETE-001, sans toucher à son placement).

## ✅ Testé live

☑ 2026-09-30 — test d'origine `tests/e2e/ide-mobile-chrome.spec.ts:1221`, non modifié, **20 passés / 0 échec sans retry** sur la branche de #602 (run `36638192896`), contre 11/20 échecs avant ; A/B bandeau affiché à chaque appui (run `36636177847`) : témoin 20/20 échecs, corrigé 0/20 ; dans la suite complète de #602, 1221 passe du premier coup. Épinglé par `tests/e2e/bandeau-toast-visible.spec.ts`. ⚠️ Vérifié en Chromium ; pas sur un iPhone réel.

## Preuve

**Mesuré le 2026-09-29 en boucle locale** (pile de la CI reconstituée, `fix/recollage-respecte-la-remontee` à `dcdeb61bcf`, 20 passages, `--retries=0`) : 11 échecs, 9 réussites. Instrument dans `appuiLong` (non commité) : position de la ligne, `scrollTop` du fil et élément désigné sous le doigt à chaque image. **Le fil ne bouge dans aucun des 20** (ligne à y=48, `scrollTop` 6). **Corrélation parfaite** : dans les 11 échecs le point touché (70, 120) désigne `#agent-auto-applied-files` (`position: fixed`, `z-index: 9999`, y = 104..278), dans les 9 réussites la ligne. Confirmé 3/3 sur une seconde boucle qui nomme la chaîne d'ancêtres.

**Épinglé par `tests/e2e/bandeau-toast-visible.spec.ts`** — sous le texte du bandeau le geste atteint le contenu recouvert, « Tout annuler » garde le geste. Rouge sans la règle (le geste tombe sur `STRONG`), vert avec ; contre-épreuve inverse : le défaut d'origine de #591 (conteneur de 0 px qui rogne) fait toujours rougir la garde anti-rognage.
