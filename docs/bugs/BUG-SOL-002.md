---
id: BUG-SOL-002
---

## Bug

App Builder présente des démos UI salon à proximité d'affirmations de génération sans montrer le vrai run dans l'IDE E-Code

## 📤 Dispatché

✅

## 💻 Codé

✅ (générateur supprimé, wording corrigé — sur `main`)

## ✅ Testé live

✅ **24/07**

## Preuve

**(1) Défaut corrigé** : `generate-app-builder-visuals.ts` (générateur HTML/CSS/JS autonome) **supprimé** (n'existe plus que dans l'historique) ; plus aucun wording « vitrine » ; `/solutions/app-builder` utilise de **vraies captures produit** + copy honnête (« AI-guided generation, real files and preview validation ») + CTA « Start building »→/signup. **(2) Preuve réelle prompt→agent→fichiers→Preview live sur prod** (compte JETABLE, supprimé après) : projet `cms8ikwey…`, prompt envoyé → **agent « Done 100% »** (`✓ Create src/App.tsx 1.6s`, `✓ Create src/styles.css 2.5s`, `Start Application — Running`). Fichiers **vérifiés octet-par-octet via l'API prod** (`GET /projects/:id/export/zip`) : `src/App.tsx` (1600o, `useClock` setInterval 1s + heading « E-Code live proof » + bouton « Change color ») et `src/styles.css` (1739o, accent `#9E7FFF`) — **vrai projet E-Code, pas du HTML autonome**. **(3) Preview E-Code rendue live** : le Webview affiche l'app générée servie par le dev server Vite (:5173) — texte iframe capté `« E-CODE PROJECT · E-Code live proof · CURRENT TIME 09:13:20 AM · Change color »` (horloge qui tourne), capture `sol002/09b-preview-iframe.png`. Boucle complète prompt→agent→fichiers→Preview prouvée. Compte jetable **supprimé** après. `docs/deploy-evidence/2026-07-24-bug-closeout/BUG-SOL-002-app-builder-live.md`

