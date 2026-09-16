---
id: BUG-GIT-001
---

## Bug

**P1 — « Committer les modifications » répond `200` et NE COMMITTE RIEN.** Parcours complet exercé en réel dans le panneau Git : clic sur « Tout indexer » → les 18 fichiers passent à « Indexé » et « Tout désindexer » apparaît ; saisie **réelle au clavier** d'un message de commit (valeur relue dans le DOM : `QA: commit local depuis le panneau Git`) ; bouton « Committer les modifications » présent et **non désactivé** ; clic. Le client émet exactement **un `POST /api/projects/<id>/ide-panel/git`** (corps `FormData`) qui répond **`200`** — aucun message d'erreur, aucune alerte. Or côté serveur **rien n'a bougé** : `HEAD` reste `9da3bdf chore: initial scaffold`, `git diff --cached --name-only` = **0 fichier indexé**, et les fichiers sont toujours `??` (non suivis). L'utilisateur croit son travail versionné alors qu'il ne l'est pas. Le panneau continue d'afficher « 18 modifications » après l'opération, seul indice — silencieux — que rien ne s'est passé.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**CAUSE TROUVÉE, et elle tient en un argument manquant.** L'intention est portée par le BOUTON d'envoi (`<PanelButton type="submit" name="intent" value="commit">`), et `new FormData(form)` **ne l'inclut pas** — la spécification n'ajoute la paire du bouton que si on le passe en second argument. Prouvé à l'exécution : `new FormData(form).get('intent')` rend `null`, `new FormData(form, bouton)` rend `'commit'`. L'intention partait donc VIDE, la chaîne `if/else if` du panneau Git — **qui n'avait pas de dernier `else`** — ne reconnaissait aucun cas, n'appelait aucune route git, et tombait sur `return json({ ok: true })`. D'où le `200` sans erreur, sur 2 projets sur 2. **DEUX MOITIÉS, parce qu'une seule ne suffit pas** : (1) un module partagé `donneesDuFormulaire()` applique la règle partout où un envoi est intercepté — le panneau Git ET le submit GÉNÉRIQUE des panneaux, qui portait le même défaut ; (2) le serveur REFUSE une intention inconnue (400) au lieu de réussir en silence, sans quoi le prochain formulaire qui oublie son intention se tairait pareil. Contre-épreuve dans 3 sens (appelant, module, serveur), plus la **contre-épreuve E2E décisive** : défaut d'origine remis et reconstruit, le test rend « aucun commit portant … — le geste n'a rien produit ». épinglé par `tests/e2e/git-commit-reel.spec.ts` + `app/lib/forms/donnees-du-formulaire.spec.ts` + `app/routes/ide-panel-git-intent.spec.ts`

