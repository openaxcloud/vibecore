---
id: BUG-USR-011
---

## Bug

**(P2) Invitations en double acceptées.** Inviter **deux fois** le même email créait **deux** invitations pending distinctes (liste « Pending invitations » dupliquée, resend/accept ambigus). Constaté live (2×201, ids différents).

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/user-area-flows` (voir SHA PR)

## ✅ Testé live

☐ *(APRÈS spec + CI)*

## Preuve

AVANT : 2× `invite {same email}` → **201/201**. FIX : garde **409 `ALREADY_INVITED`** (invite pending non-acceptée non-expirée existante). APRÈS : spec 1/1 (1er 201, 2e 409, exactement 1 pending). Fidélité du store de test corrigée : `listMembers` joint désormais `userEmail`.

