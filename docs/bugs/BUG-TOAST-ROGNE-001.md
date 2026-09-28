---
id: BUG-TOAST-ROGNE-001
---

## Bug

**P1 — les toasts de l'IDE sont dans le DOM mais jamais peints : le bandeau « 1 fichier appliqué » et son « Tout annuler » sont inatteignables**, sur téléphone comme sur bureau. Trouvé en instruisant BUG-TOAST-ENTETE-001 (captures d'Avi, semaine du 21/09) : le correctif de position de #589 déplace un bandeau que Chromium et WebKit ne peignent pas.

## 📤 Dispatché

☑ 28/09

## 💻 Codé

☑ 28/09 — `.Toastify__toast-container[data-stacked='true'] { overflow: visible; }` dans `app/styles/index.scss`.

## ✅ Testé live

☑ 28/09 — preuve live sur la prod servie en `7f573aaf0` (déploiement 36398927324, CSS `index-CF-FWrxp.css` portant les deux règles), vraie génération, 390 px **WebKit profil iPhone ET Chromium** : bandeau à y=104..278, x=8..382, peint (`elementFromPoint` rend le toast en trois points), sous l'en-tête et la barre d'adresse de la Webview, « Tout annuler » et « Tout fermer » visibles — captures regardées. + épinglé par `tests/e2e/bandeau-toast-visible.spec.ts` (chromium + webkit-iphone ; peinture ET position).

⚠️ Non vérifié sur un Safari iOS **réel** : WebKit de Playwright seulement.

## Preuve

**Mesuré le 2026-09-28 sur la prod servie en `d4a6f1df28`**, pendant de vraies
générations (compte QA jetable, projets supprimés après usage) :

```
390 px Chromium    toast t=60 b=234 l=0 r=358   conteneur h=0 overflow-y=auto data-stacked=true
                   elementFromPoint(centre du toast) = IFRAME de l'aperçu
390 px WebKit      idem (profil iPhone) — elementFromPoint = .bolt-preview-loading-overlay
1440 px Chromium   toast t=60 b=231 l=1044 r=1424   conteneur h=0 — toast non peint
```

Contre-épreuve en production : `overflow: visible !important` injecté sur le
conteneur → le bandeau apparaît, à y=60, collé au bord gauche, sur la barre
d'adresse de la Webview — exactement la capture d'Avi.

**Cause.** `<ToastContainer stacked>` (root.tsx) : en mode empilé, chaque toast
est `position: absolute` (`.Toastify__toast--stacked`), le conteneur n'a plus
rien dans le flux et mesure 0 px. `.Toastify__toast-container--top-right`
(index.scss) lui impose `overflow-y: auto` : un conteneur de défilement de 0 px
rogne tout ce qu'il positionne.

**Pourquoi le toast est collé à gauche en production** (x=0 et non x=16) :
react-toastify 11 réinjecte sa feuille EN LIGNE à l'exécution, après
`index.css` ; sa règle mobile `left: env(safe-area-inset-left)` gagne l'égalité
de spécificité contre `left: auto`. Relevé dans `document.styleSheets` en prod.
C'est l'override de BUG-TOAST-ENTETE-001 (#589), à (0,2,1), qui repose `left`.

**Non vérifié** : Safari iOS réel. Avi a vu le bandeau, WebKit de Playwright ne
le peint pas ; l'écart vient probablement du moteur réel, il n'a pas été mesuré.

Épinglé par `tests/e2e/bandeau-toast-visible.spec.ts` (Chromium + `webkit-iphone`,
390 et 1440 px) : vraie feuille compilée, vraie feuille react-toastify dans
l'ordre de la production, DOM `stacked` de la v11, et `elementFromPoint` au centre
du toast et sur « Tout annuler ». Contre-épreuve : correctif retiré → 4 rouges ;
remis → 4 verts.
