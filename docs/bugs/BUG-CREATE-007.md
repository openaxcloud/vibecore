---
id: BUG-CREATE-007
---

## Bug

**P2 — l'IDE demande la lecture d'un dossier comme si c'était un fichier.** `GET …/files/read?path=src` → `400 WORKSPACE_AGENT_CLIENT_ERROR`. Requête en échec systématique à l'ouverture, sans effet visible mais qui pollue le diagnostic de tous les autres défauts.

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

**Le code était juste, la GARDE manquait** (règle 15) : `fileStat.isDirectory()` rend bien `EISDIR`, mais aucun test ne l'exigeait. Garde écrite, avec un témoin positif (le même point d'entrée lit bien un vrai fichier) pour qu'elle ne passe pas au vert sur un serveur cassé.

## Preuve

☐ live iPhone

