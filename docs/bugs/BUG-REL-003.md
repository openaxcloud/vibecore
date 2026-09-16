---
id: BUG-REL-003
---

## Bug

**P2 — le job « Roll CI attestation » ne peut PAS pousser sur `main` : refuse par la protection de branche.** L'attestation de parite n'est donc jamais roulee.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **OUVERT — mesure en prod 01/09**

## Preuve

**Mesure** (run `33477515318`, commit `e62f8655`) : le job cree bien le commit (`4 files changed, 24 insertions(+), 24 deletions(-)`) puis `git push origin HEAD:main` est rejete — `remote: error: GH006: Protected branch update failed` / `remote: - 3 of 3 required status checks are expected` / `! [remote rejected] HEAD -> main (protected branch hook declined)`. **Impasse par construction** : l'automatisation pousse un commit direct sur `main`, mais `main` exige 3 checks qu'un push direct ne peut pas produire.

