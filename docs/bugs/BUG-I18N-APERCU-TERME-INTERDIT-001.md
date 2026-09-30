# BUG-I18N-APERCU-TERME-INTERDIT-001

**Gravité** — GÊNANT pour l'utilisateur, **BLOQUANT pour la lecture de la CI**.

**État** — 📤 non dispatché · 💻 non codé · ⬜ non testé live.

## Ce qui se passe

L'audit i18n live (« French i18n live audit ») échoue sur la page
`/projects/<id>/preview`, dans les **quatre** formats (desktop-1024, desktop-1440,
mobile-390, tablet-768). Deux entrées de DOM non traduites y sont relevées :

| raison | texte | emplacement |
|---|---|---|
| `forbidden-term` | « Connectez un compte Bitbucket pour vos **workflows** Git hébergés. » | `app/lib/i18n/catalogs/git-provider-connect.ts:69`, clé `gitProvider.bitbucket.description` |
| `english-match` | « - You » | `div:nth-of-type(3) > div > button > div:nth-of-type(2) > div:nth-of-type(2)` — non localisé dans le code, à retrouver |

Le terme fautif est **`workflows`**, listé dans `FORBIDDEN_FRENCH_TERM`
(`app/lib/i18n/catalogs/live-audit-heuristics.ts:115`). La phrase est en français,
mais elle garde un mot anglais que l'audit interdit.

## Pourquoi c'est prioritaire même si c'est petit

**Ce défaut peint QUATRE contrôles en rouge sur toutes les propositions** dont les
chemins déclenchent cet audit. C'est la même maladie que `Deploy Preview` (retiré par
#636) : un rouge permanent apprend au dépôt entier à ignorer le rouge. Et il m'a déjà
eu — voir plus bas.

## Ce n'est PAS un test instable

**Mesuré le 2026-09-30 : 8 passages terminés, 8 `failure`, 0 succès.** Il échoue sur
toutes les branches mesurées (`fix/oauth-garde-la-destination`,
`fix/clavier-ios-hauteur-de-repos`, `fix/ecritures-refusees-workspace`,
`fix/modale-focus`, `fix/publier-pied-colle-barre`, `fix/idee-entre-domaines`). Selon
la règle 17, l'hypothèse « course » est morte : c'est un défaut déterministe sur `main`.

Verdict de l'audit lui-même : `1 failed, 3 passed (23.9m)`.

## Portée : deux entrées, PAS une campagne

Un balayage statique compte **307 lignes** de catalogue contenant « workflow » — mais
la plupart sont les chaînes **anglaises**, qui sont légitimes, et l'audit ne relève que
ce qui est **visible** sur les pages auditées. Corriger les deux entrées nommées
ci-dessus suffit à rendre l'audit vert. **Ne pas transformer ça en campagne de 307
lignes** sans mesurer d'abord ce qui est réellement rendu.

## ⚠️ Comment je me suis trompé, et ce qui l'a permis

J'ai d'abord annoncé « panne du HARNAIS : l'API n'a jamais servi `/health` sur 3001 ».
**C'était faux**, sur trois instruments menteurs d'affilée :

1. **`gh run view --log-failed` a rendu le journal ENTIER.** Les étapes du job sont
   étiquetées `UNKNOWN STEP`, donc l'outil ne sait pas les attribuer et ne filtre rien.
   Mon `grep` est tombé sur des lignes arbitraires.
2. **J'ai lu du SOURCE DE SCRIPT comme une sortie.** La ligne
   `echo '::error::L API n a pas servi /health…'` est l'écho du script, pas une erreur
   émise. Juste après les six `curl: (7)` — l'attente de démarrage NORMALE — le journal
   dit `API prête (tentative 1)`.
3. **Un seul octet NUL dans le journal a rendu tous mes `grep` MUETS.** Le fichier
   faisait 283 110 octets, dont exactement un NUL : `grep` le traite alors comme
   binaire et n'affiche plus rien, pas même `0`. Mes contrôles positifs rendaient du
   VIDE au lieu d'un compte, ce qui se lit comme « rien trouvé ».
   **Le remède : `tr -d '\000'` avant toute recherche dans un journal téléchargé.**

L'étape réellement en échec ne s'obtient pas du journal mais de l'API :
`gh api repos/<dépôt>/actions/jobs/<id> --jq '.steps[] | select(.conclusion=="failure")'`
→ « Run exhaustive EN/FR live audit » et « Verify complete proof set ».

## Preuve

Passage `36719379445`, job `109900253374` (mobile-390), 2026-09-30T13:07.
Chaîne confirmée présente sur `origin/main` :
`git grep -n -F 'pour vos workflows Git' origin/main` →
`app/lib/i18n/catalogs/git-provider-connect.ts:69`.
Terme confirmé interdit : `live-audit-heuristics.ts:115`.

**Reste à épingler par un test** (règle 16) : la fermeture de ce point exige un spec qui
rougit tant qu'une chaîne **rendue** porte un terme interdit — pas seulement le retour au
vert de l'audit, qui date du jour où il a tourné.
