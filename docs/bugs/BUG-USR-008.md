---
id: BUG-USR-008
---

## Bug

**FAUX POSITIF (retire BUG-USR-005).** « Boutons Buy credits désactivés sans explication » : re-vérifié live — `billing.tsx` **affiche déjà** la raison au-dessus des boutons quand `!credits.creditsEnabled` : « Credit-pack purchases are not enabled for this organization yet. » Le check initial n'inspectait que les attributs du bouton (title/aria) et manquait le `<p>` frère. Aucun correctif — ce n'était pas un bug.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

—

## ✅ Testé live

✅ **retiré 06/08**

## Preuve

Live prod `/billing` : boutons `disabled` **ET** texte visible « Credit-pack purchases are not enabled for this organization yet. » présent (`main.innerText`).

