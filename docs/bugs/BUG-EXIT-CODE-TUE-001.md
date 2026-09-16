---
id: BUG-EXIT-CODE-TUE-001
---

## Bug

**P1 — une commande TUÉE remontait comme une RÉUSSITE, d'un bout à l'autre de la chaîne.** Node rend `code === null` quand un processus meurt par signal ; sept sites écrivaient `?? 0` dessus. Un `npm install` tué par l'OOM du pod, la moisson ou un SIGKILL de délai s'annonçait donc en `exit 0`, et le déploiement ou l'aperçu enchaînait sur un travail qui n'avait jamais fini.

## 📤 Dispatché

☑ 10/09

## 💻 Codé

☑ 10/09

## ✅ Testé live

☐

## Preuve

**TROUVÉ PAR UN AUDIT ADVERSARIAL de mon propre correctif BUG-DEPLOY-010**, pas par moi. **SEPT SITES, TROIS PAQUETS, et c'est ce qui rend le défaut si tenace : il se répare par bouts.** Corriger l'agent seul déplace le zéro dans l'API ; corriger l'API seule le déplace dans le client — j'ai commencé par ne corriger que l'agent et j'ai vu le défaut se déplacer dans `foldCommandExitCode`, exactement comme ce matin avec BUG-PUBLISH-NOOP-001. Les sites : `services/workspace-agent` (`close` du flux de commandes, qui envoyait `exitCode: code ?? 0` — il transmet maintenant le code TEL QUEL et le SIGNAL avec lui) ; `services/api` (trois déclarations `code: number` qui MENTAIENT — l'agent résout `{ id, code, signal }` avec le `code` de Node, donc `null` est possible — plus quatre lectures `?? 0`, y compris sur le chemin de repli local et sur le sondage du gestionnaire) ; `app/lib/runtime/command-exit.ts` (`event.exitCode ?? 0`). **CE FICHIER-LÀ TENAIT DÉJÀ LE BON RAISONNEMENT POUR L'ÉVÉNEMENT VOISIN** : son commentaire explique qu'un `error` doit rendre un code NON NUL, « otherwise the default exit code 0 is returned and callers treat a half-finished install as success, launching the preview against a broken node_modules ». Le même raisonnement valait pour l'`exit` sans code ; il manquait. ⚠️ **ET J'AI FAILLI RÉINTRODUIRE LE DÉFAUT DANS MON PROPRE CORRECTIF** : j'ai écrit `event.exitCode ?? current ?? 1`, or `current` vaut 0 dans le cas normal et `0 ?? 1` rend 0. C'est `current

