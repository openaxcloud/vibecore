---
id: BUG-MKT-005
---

## Bug

**P2 — page 404 sans titre dédié.** Une URL inexistante renvoie bien le **statut HTTP 404** (correct), mais le `<title>` reste le générique « E-Code — AI application development platform » au lieu d'un titre « page introuvable ». Repro : `curl -s https://e-code.ai/page-inexistante-xyz \

## 📤 Dispatché

grep '<title>'`.

## 💻 Codé

✅ 06/08

## ✅ Testé live

✅ `2a0b4124`+`ffc4ada6`

## Preuve

✅ 10/08

