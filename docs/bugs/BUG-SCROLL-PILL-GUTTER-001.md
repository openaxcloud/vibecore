---
id: BUG-SCROLL-PILL-GUTTER-001
---

## Bug

**P2 — Fil de l'agent sur iPhone : en remontant la conversation, la pastille « descendre » apparaît à droite et TOUT le fil se rétrécit** (Avi, 07/09 07:58 : « l'icône scroll se met à droite et tout le texte se met à droite au lieu qu'il reste comme il est et que l'icône scroll se positionne juste au-dessus de la zone de saisie »). Cause mesurée (Chromium 390, b858bdb : bulle de 380 à 316 px de bord droit en remontant, pastille à 12 px du bord, 2 px au-dessus du composeur) : `.bolt-project-agent-transcript:has(.bolt-agent-scroll-to-bottom) .bolt-chat-message-row { padding-inline-end: 64px }` réserve une gouttière de 64 px dès que la pastille existe — le fil change de largeur quand on remonte. Attendu : le fil ne bouge pas, la pastille est centrée juste au-dessus de la zone de saisie.

## 📤 Dispatché

☑ 07/09

## 💻 Codé

☑ 07/09 (`main`) — sur téléphone (gabarit mobile) la gouttière est retirée (`padding-inline-end: 0`, spécificité (0,4,0)) et la pastille passe en `margin-inline: auto`, toujours à 2 px au-dessus du conteneur du composeur ; elle est translucide, le texte reste lisible dessous. Le bureau garde la gouttière et le bord (décision BUG-UX-021). Vérifié sur Chromium (E2E) et sur WebKitGTK à 390 : pastille 173–217 px (milieu du fil 195), rembourrage 0, bord droit du fil 380 avant comme après, bas de pastille 635 pour un composeur à 637. Épinglé par `app/styles/agent-scroll-to-latest.spec.ts` (téléphone) + `tests/e2e/ide-mobile-chrome.spec.ts` (fil de l'agent : largeur inchangée, pastille centrée, ≤ 16 px au-dessus de la zone de saisie) — rouges sans le correctif.

## ✅ Testé live

☐

## Preuve

07/09 07:58.

