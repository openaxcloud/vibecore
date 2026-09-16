---
id: BUG-UX-005
---

## Bug

Le loader global plein écran peut recouvrir un dashboard déjà rendu pendant plus de 30 secondes lors d’un fetch ou d’une revalidation secondaire

## 📤 Dispatché

✅

## 💻 Codé

✅

## ✅ Testé live

✅

## Preuve

`GlobalRouteLoader` est désormais piloté uniquement par `useNavigation`; les fetchers/revalidations secondaires conservent leur UI locale. Reproduction E2E exacte validée le 2026-07-14 sur `127.0.0.1:5176` avec backend réel `3001` et captures activées : `1 passed (37.5s)`, loader `aria-hidden="true"` et opacité `0` sur toutes les captures.

