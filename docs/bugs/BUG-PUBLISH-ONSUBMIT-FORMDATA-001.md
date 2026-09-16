---
id: BUG-PUBLISH-ONSUBMIT-FORMDATA-001
---

## Bug

**P1 — quatre boutons de la carte « Gérer votre application » sont MORTS, sans un seul message à l'écran** : « Annuler », « Republier », « Revenir à cette version » et l'action générique. ⚠️ **DONT LE MIEN** — le correctif BUG-PUBLISH-NOOP-001 posé ce matin a retiré le `setTab('manage')` et mis un vrai envoi à la place : le bouton a cessé de changer d'onglet, et n'a rien déclenché non plus. **J'ai déplacé le défaut au lieu de le corriger.**

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**MESURÉ PAR EXÉCUTION, pas par lecture** : ces gestes appellent `onSubmit(donnees)` avec un `FormData` nu, mais `onSubmit` est au bout de la chaîne `async function submit(event: React.FormEvent<HTMLFormElement>)` dont la PREMIÈRE instruction est `event.preventDefault()`. `FormData` n'a pas de `preventDefault` → `TypeError: f.preventDefault is not a function`, reproduit en isolation. **DEUX AMPLIFICATEURS qui s'additionnent, et c'est ce qui rend le défaut invisible** : la fonction est `async`, donc le throw devient une promesse rejetée au lieu de remonter au gestionnaire de clic ; et l'appelant ne fait ni `await` ni `.catch`. Zéro trace. **CE QUI L'AVAIT MASQUÉ CÔTÉ TYPES** : `ProjectIdePanelContent` déclarait bien la signature, mais `ProjectDeploymentsPanel` re-déclarait la même prop en `any` — le `any` éteignait la seule vérification qui l'aurait attrapé à la construction. Correctif : `submit` accepte l'union `FormEvent

