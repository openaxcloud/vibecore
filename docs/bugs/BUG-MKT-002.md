---
id: BUG-MKT-002
---

## Bug

**P1 — localisation FR incohérente entre pages marketing.** Avec `Accept-Language: fr-FR,fr;q=0.9`, **seules** les fiches `/solutions/*` servent le français (`<html lang="fr">`, contenu 100 % FR, sélecteur « English / Français » dans l'en-tête). Les **14 autres pages** publiques restent en anglais (`lang="en"`) et **n'ont aucun sélecteur de langue**. Un visiteur français passant d'une fiche solution à `/pricing` ou `/contact` bascule en anglais sans moyen de revenir. Repro : `curl -H 'Accept-Language: fr-FR,fr;q=0.9' https://e-code.ai/solutions/app-builder` → `lang="fr"`, titre « App Builder métier avec code source réel » ; même commande sur `/pricing`, `/contact`, `/about`, `/enterprise`, `/terms`, `/privacy`, `/blog`, `/careers`, `/changelog`, `/legal`, `/features`, `/solutions`, `/contact-sales` → `lang="en"`. Vérifié aussi dans le navigateur : `/solutions/app-builder` → nav FR avec sélecteur ; `/pricing` → aucun sélecteur (`switcher: []`).

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `b4aa6df0` (merge `d68533f3`)

## ✅ Testé live

✅ 10/08

## Preuve

**NON CORRIGÉ ICI, délibérément** : chevauche le chantier i18n en cours (catalogue `marketingPageCopyEn/Fr`, PR #106 draft non mergée). Corriger en parallèle produirait deux implémentations concurrentes du même sélecteur. À rattacher à ce lot plutôt qu'à refaire. **✅ Testé live 10/08 (prod `e-code.ai`)** — audit SEO réel sur 12 pages marketing (`/`, `/pricing`, `/features`, `/solutions`, `/enterprise`, `/about`, `/contact`, `/blog`, `/terms`, `/privacy`, `/careers`, `/changelog`), toutes HTTP 200. **Vérifié** : sous `Accept-Language: fr-FR,fr;q=0.9` les **12/12** pages servent `<html lang="fr">` avec un titre FR (« Tarifs — E-Code », « À propos — E-Code », « Politique de confidentialité — E-Code »…), et sous `Accept-Language: en-US` elles servent `lang="en"` — le décrochage « seules les fiches /solutions sont en FR » est levé. **Sélecteur de langue** : présent ET visible sur **13/13** surfaces testées (12 pages marketing + une fiche solution), mesuré **90×46 px** à 1440 **et** à 390 dans le DOM rendu. ⚠️ Le sélecteur est monté côté client : un `curl` seul ne le voit pas (0 occurrence en HTML SSR) — c'est le contrôle navigateur qui fait foi, pas le grep.

