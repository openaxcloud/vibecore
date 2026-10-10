---
id: BUG-TOAST-ENTETE-001
---

## Bug

**P2 — le bandeau « 1 fichier appliqué » recouvre l'en-tête du panneau sur téléphone** (Avi, captures de la semaine du 21/09). Pendant que l'agent applique des fichiers, la notification s'ouvre par-dessus le chrome du panneau au lieu de se placer dessous.

## 📤 Dispatché

☑ 28/09

## 💻 Codé

☑ 28/09 — override mobile de `body:has(.bolt-project-statusbar) .Toastify__toast-container` sous `@media (max-width: 767px)`.

## ✅ Testé live

☑ 30/09 — preuve live en prod à 390 px (Chromium), compte QA jetable : bannière sous l'en-tête (y=104, en-tête 101), peinte, « Tout fermer » cliquable ; vue aussi sous WebKit profil iPhone le 28/09 + épinglé par `tests/e2e/bandeau-toast-visible.spec.ts`.

## Preuve

**Mesuré le 2026-09-28 à 390 px**, sur la prod servie en `d4a6f1df28`, pendant
une génération réelle (sonde authentifiée, session révoquée) :

```
42s  BANDEAU « 1 fichier appliqué … »  rect t=60 b=234 l=200 r=558 h=174
     conteneur top=60px  z-index=9999
     topbar .bolt-project-topbar  h=0     nav mobile  t=772 b=844 h=72
     RECOUVRE  button.bolt-preview-url-text            t=60  b=88
               button.bolt-preview-open-external       t=52  b=96
               div.bolt-preview-loading-overlay        t=111 b=763
```

**Ce que le bandeau masque n'a pas été déduit** : la sonde a interrogé
`document.elementsFromPoint` sur une grille de neuf points du rectangle du
bandeau et a retenu le premier élément non-notification de chaque pile. Ce sont
la barre d'adresse de la Webview et son bouton « ouvrir dans un onglet » qui
sont nommés.

**Cause.** Quatre règles se disputent le `top` du conteneur ; celle qui gagne est
`body:has(.bolt-project-statusbar) .Toastify__toast-container`, en (0,2,1) contre
(0,2,0) pour les deux overrides mobiles — d'où les 60 px mesurés et non les 56 px
que ces overrides demandent. Ces 60 px sont calibrés sur la barre supérieure du
projet ; **sur téléphone cette barre est collapsée** (hauteur mesurée : 0) et
c'est le chrome du panneau qui occupe la bande 0..96.

**Pourquoi pas par le bas** : le composeur de l'agent et la barre de navigation
mobile (mesurée y=772..844) y vivent déjà. Masquer le champ de saisie serait un
défaut pire que celui-ci — c'est l'erreur naturelle quand on « déplace un bandeau
qui gêne », et un cas du spec l'interdit explicitement.

**Épinglé par `app/styles/deux-defauts-visuels.spec.ts`** (§1, quatre cas).
Contre-épreuve dans les deux sens, ligne de verdict lue à chaque fois :
override retiré → **3 rouges / 6 verts** ; tout remis → **9 verts**. Le cas
« le piège est toujours armé » vérifie que la règle de base pose encore 60 px,
pour que l'override rougisse le jour où il devient inutile au lieu de survivre
sans raison.
