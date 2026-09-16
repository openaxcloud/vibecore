---
id: BUG-USR-010
---

## Bug

**(P2) Auto-invitation / invitation d'un membre existant acceptée.** `POST /orgs/:org/invitations` ne vérifiait pas l'appartenance : inviter sa **propre** adresse (déjà owner) ou celle d'un membre existant → **201**, créant une invitation morte. Constaté live.

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/user-area-flows` (voir SHA PR)

## ✅ Testé live

☐ *(APRÈS spec + CI)*

## Preuve

AVANT : `invite {email: <own>}` → **201**. FIX : garde **409 `ALREADY_MEMBER`** (comparaison email insensible à la casse via `listMembers().userEmail`). APRÈS : spec 2/2 (self 409, casse 409).

