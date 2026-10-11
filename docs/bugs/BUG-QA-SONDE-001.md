---
id: BUG-QA-SONDE-001
---

## Bug

**Note de méthode — trois faux positifs de MA sonde, écartés avant de rien consigner comme défaut produit.**

## 📤 Dispatché

—

## 💻 Codé

—

## ✅ Testé live

— **18/08**

## Preuve

(1) Remontée d'ancêtres seule : ratait un **frère absolu** peignant un dégradé → le héros du login (blanc sur orange) comptait « blanc sur clair », 11 faux positifs. (2) Échantillonnage par point en coordonnées **viewport** : pour un élément hors écran, mesurait le haut de la page → **154 faux positifs** sur `/features`, dont un prétendu « texte sombre sur fond noir » qui n'existe pas (les sections `bg-slate-950` sont volontairement sombres, leur texte est blanc). (3) `elementsFromPoint` **ignore `pointer-events:none`** : le CTA « Build now » étant `disabled`, la sonde lisait le fond DERRIÈRE lui → faux « blanc sur blanc » sur l'accueil. **Sonde retenue** : remontée d'ancêtres + prise en compte des frères absolus qui recouvrent la boîte, sans test par point. Vérifiée stable sur les 3 formats et les 2 thèmes.

