---
id: BUG-DIAG-TEMP-001
section: "Balayage QA du 2026-09-04 — panneaux instables, lenteur, archive, état de l'IDE"
---

## Bug

**Un diagnostic déclaré « temporary » est servi en production depuis DEUX MOIS et écrit dans la console de CHAQUE utilisateur, à CHAQUE requête.** `app/components/chat/Chat.client.tsx` enveloppe le `fetch` du transport pour journaliser toute requête vers `/api/chat` (`[chat-fetch]`, `[send] branch=…`).

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

**Mesuré le 10/09** : introduit le **2026-07-11** (`fix(chat): reopened project append() posted nothing`), et toujours présent dans le chunk `Chat.client-CNR0_RpU.js` de l'image servie — vérifié sur le bundle téléchargé depuis `e-code.ai`. Le commentaire a été corrigé (il porte désormais la date de mise en service et la preuve qu'il est servi) mais **le code n'a pas été touché** : le retirer est un changement de comportement, hors d'une passe de commentaires. **Décision attendue** : soit on le retire, soit on assume un diagnostic permanent — mais on ne le laisse pas « temporaire » un troisième mois.

