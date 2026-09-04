# Registre des tests instables

Un test instable n est pas un non-evenement : c est un defaut a part entiere.
Il coute du temps a celui qui tombe dessus, et surtout il apprend a relancer
plutot qu a regarder — c est ainsi qu un vrai defaut finit par passer pour un
caprice.

**Regle** : a chaque instabilite constatee, une ligne ici, avec le SHA et les
deux executions opposees. La prochaine fois qu il rougira, on saura si c est la
deuxieme fois ou la vingtieme.

| test | date | SHA | preuve de l instabilite | etat |
|---|---|---|---|---|
| `tests/e2e/agent-message-density.spec.ts` › densite des messages — pointeur grossier › actions repliees au repos, depliees au toucher du message | 2026-09-04 | `5e3ab9d8b1` puis `4db97589dd` | **Deux executions opposees sans aucun changement de code** : succes sur `a0935537fc`, **echec** sur `5e3ab9d8b1`, succes sur `4db97589dd`. Aucun des commits intermediaires ne touche ce test ni la barre d actions. J ai soupconne #328 (`min-h-11` force a 44px sous 1024px) — a tort : la barre est repliee par `height: 0; overflow: hidden`, qu un `min-height` sur ses boutons ne rouvre pas. | OUVERT |
| meme test, variante **pointeur fin** › actions masquees au repos, revelees au survol | 2026-09-04 | PR #439 | `flaky (passed on retry): 1` sur le meme run. La porte E2E distingue deja `flaky` de `failing` — il suffit de lire la ligne. | OUVERT |

## Ce que le compteur de la porte E2E permet de trancher

`scripts/e2e-gate.mjs` rend deux compteurs distincts :

- `flaky (passed on retry): N` — le test a echoue puis reussi : hypothese de course encore tenable.
- `failing tests that are NOT waived` avec `flaky: 0` — il a echoue a **toutes** les tentatives : l hypothese de course est **morte**. Soit le comportement a change, soit la course s est elargie au point de ne plus se refermer.

Mesure du 2026-09-04 sur **#442** : premier run `flaky: 1`, second run `flaky: 0` et
le meme test en echec. C est ce passage de l un a l autre qui a fait basculer le
diagnostic de « instable » a « defaut reel », et qui a evite de la fusionner.
