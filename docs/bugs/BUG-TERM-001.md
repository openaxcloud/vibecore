---
id: BUG-TERM-001
---

## Bug

**P1 — le panneau Terminal ne devient jamais utilisable : aucune commande ne s'exécute.** Le shell s'ouvre, affiche « Connexion à l'espace de travail… » puis une invite `/workspace $`, et le focus va bien sur la `textarea` d'xterm — mais **la touche Entrée ne produit rien** (ni saut de ligne, ni nouvelle invite, ni sortie) et un **shell fraîchement créé n'échoue même plus les caractères saisis**. Le texte visible dans le premier shell est un **écho local d'xterm** : il s'accumule sur une seule ligne d'invite (`ls -1 src; echo QA_TERM_OKaecho QA_PASTE_OK`) sans jamais être soumis. **Preuve serveur décisive** : le pod contient **7 processus `/bin/bash --noprofile --rcfile … -i`** dont le plus ancien tourne depuis **36 min**, tous avec un temps CPU de **`0:00`** — aucun n'a jamais exécuté quoi que ce soit. Les shells s'**accumulent** par ailleurs à chaque ouverture de panneau sans être moissonnés.

## 📤 Dispatché

✅ 15/08

## 💻 Codé

✅ **corrigé** `61bbdd06`

## ✅ Testé live

☐

## Preuve

**Cause racine : entièrement CÔTÉ CLIENT.** `app/utils/shell.ts` gardait `session.write(data)` derrière un booléen `isInteractive` armé par le marqueur OSC `\x1b]654;interactive\x07`. Deux façons de le rater définitivement : (1) la détection ne lisait que le **premier** marqueur du chunk (`match` sans `g`) — or au reattach le flux commence par `exit=0:0` puis `prompt` puis `interactive` ; (2) **aucun report entre chunks**, donc un marqueur coupé entre deux frames WS (`…]654;inter` + `active\x07`) ne correspondait à rien. Une fois raté, rien ne rattrapait et **chaque frappe était jetée en silence**. Défaut dupliqué dans `newShellProcess` ET `BoltShell.newBoltShellProcess`. **Le chemin SERVEUR est sain** : un harnais WebSocket brut rejouant exactement la route et l'enveloppe `{type:'stdin'}` du client réel contre l'env d'audit **exécute la commande et reçoit sa sortie** (flux reconstitué : `]654;interactive` … `echo CAP_OK` … `CAP_OK` … `]654;exit=0:0`) — API→agent→PTY hors de cause. **Correctif** : module `app/utils/shell-interactive-gate.ts` qui scanne **tous** les marqueurs du chunk, conserve un report suffisant pour recoller un marqueur scindé, et surtout **ne jette plus jamais une frappe** (file plafonnée à 64 Kio, vidée dans l'ordre à l'ouverture). **Preuve rouge→vert** : 4 tests bout-en-bout ajoutés à `shell.spec.ts` suivent une frappe de `terminal.onData` jusqu'à `session.write` — trou de couverture qui avait laissé passer le bug ; avec l'ancien code **3 échouent dont 2 en timeout de 120 s** (le handshake n'arrive jamais, `newShellProcess` ne résout pas), avec le correctif **12/12 en 5 ms**. Suites vertes : `shell-interactive-gate.spec` 10/10 (neuf), `shell-input-binding.spec` 6/6, terminal/workbench 23/23. ⚠️ Reste ✅ à cocher après vérif live post-déploiement (l'env d'audit tourne `web:df1287d856`, antérieur au correctif). Onglet Terminal **mobile** volontairement non touché (gelé sur la réf d'Avi). L'accumulation de shells (7 pour une session) a une **cause distincte encore ouverte** : `services/api/src/app.ts:17267-17271` ne propage pas la query string (`sessionId`, `cols`, `rows`) vers l'agent, qui génère donc un id neuf à chaque connexion → jamais de reattach, géométrie figée à 80×24, et mort du terminal au 8ᵉ slot (`maxSessions=8`, grâce 5 min). **Corrigée le 15/08** (`83dc77cf`) : `forwardedAgentQuery()` propage désormais `sessionId`/`cols`/`rows` par liste blanche vers l'agent — le `token` (re-minté par saut) et `managed` (lu par l'API seule) restent exclus, ce qui empêche aussi l'injection de paramètres arbitraires dans l'URL interne. 7 tests. Mesures qui ont motivé le correctif : **21** `bash -i` orphelins pour une seule session, **66× 429** en 8 min, et **7/8 shells en 6 min** sur un pod pourtant recréé propre.

