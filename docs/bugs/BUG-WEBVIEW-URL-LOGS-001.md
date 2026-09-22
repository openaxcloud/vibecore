---
id: BUG-WEBVIEW-URL-LOGS-001
---

## Bug

**P2 — Webview sur iPhone : (a) l'URL de la barre d'adresse est en grande police alors que tout le reste a été réduit ; (b) « Afficher les journaux » ouvre des journaux qu'on ne peut plus refermer** (Avi, 07/09 08:19, capture entourée en rouge : « tu as réduit la police du contenu comme le reste, où il y a l'URL ; et quand j'ouvre les journaux je ne peux pas les fermer »). Mesuré : (a) le champ d'URL est à 16 px par le plancher iOS (IOS-ZOOM-001 : en dessous, Safari zoome au focus et ne dézoome jamais) pendant que le reste du panneau est à 12–13 px ; (b) le seul bouton de l'en-tête des journaux, « Ancrer à droite », est caché sur téléphone (pas de volet de droite) — il ne restait aucun moyen de refermer le panneau.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main`) — (a) hors édition, un bouton en 13 px montre l'adresse et le champ est retiré de la vue (pas de `display: none`, il doit rester focalisable) ; un appui révèle le champ à 16 px et le focalise — la police rendue au focus reste au plancher, donc pas de zoom ; sur bureau rien ne change. (b) Une croix « Masquer les journaux » (44 × 36 px) dans l'en-tête des journaux, visible partout. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§23) + `tests/e2e/ide-mobile-chrome.spec.ts` (Webview : URL 13 px / champ 16 px focalisé au toucher ; journaux ouverts puis refermés par la croix).

## ✅ Testé live

☐

## Preuve

07/09 08:19.

