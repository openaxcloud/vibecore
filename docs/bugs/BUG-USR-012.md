---
id: BUG-USR-012
---

## Bug

**(P2, a11y WCAG 1.3.5) Champs sans `autocomplete`.** Les formulaires d'auth (login/register/forgot) ont déjà le bon `autocomplete` (email/current-password/new-password/name) et le reduced-motion + tailles de cible ≥24px sont OK ; MAIS `/account-settings` (name, email) n'avait **aucun** `autocomplete`, et `/invitations` (email) non plus → autofill/gestionnaire de mots de passe ne peut pas identifier l'objet du champ. Constaté live (audit DOM des attributs).

## 📤 Dispatché

✅ 06/08

## 💻 Codé

✅ `fix/user-area-a11y` (voir SHA PR)

## ✅ Testé live

☐ *(APRÈS via code + CI, pas déployé)*

## Preuve

AVANT : `/account-settings` name/email `autocomplete=null` ; `/invitations` email `autocomplete=null`. FIX : `autocomplete="name"`/`"email"` sur le profil ; `autocomplete="off"` sur l'email d'invitation (c'est l'adresse de l'INVITÉ, pas celle de l'utilisateur connecté → ne pas autofill).

