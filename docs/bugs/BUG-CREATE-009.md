---
id: BUG-CREATE-009
---

## Bug

**P3 — `aria-label="Unavailable"` en anglais dans l'interface française**, sur les compteurs d'erreurs et d'avertissements de la barre d'état de l'IDE.

## 📤 Dispatché

☑

## 💻 Codé

☑

## ✅ Testé live

☐ **Constaté live 17/08 ; correctif non revérifié à l’écran**

## Preuve

Relevé des attributs `aria-label` de `[class*=statusbar]`. **✅ CORRIGÉ DEPUIS, ligne restée à ☐ par oubli — relevé le 09/09 dans le code.** La cause n'était pas une chaîne oubliée dans le catalogue : `count` était passé DÉJÀ MIS EN FORME à `t()`, or i18next s'en sert pour choisir entre `_one` et `_other` — une chaîne au lieu d'un nombre faisait échouer la résolution, et l'étiquette tombait sur le secours « Unavailable », en anglais, dans une interface française. `count` reste un nombre, le nombre mis en forme passe à part (`formatted`). Les deux compteurs, erreurs ET avertissements, sont traités. épinglé par `app/components/chat/diagnostics-count-label.spec.tsx` et `app/components/chat/panel-empty-states.spec.ts` (le catalogue porte bien « errors » / « erreurs »).

