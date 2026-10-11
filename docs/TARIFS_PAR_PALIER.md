# La carte de routage ne sait pas exprimer un tarif par palier

**Constat daté du 2026-09-16. Limite connue, non corrigée.**

## Ce que la carte sait dire

Une ligne de `AgentRoutingCard` porte **un seul prix d'entrée et un seul prix de
sortie** :

```ts
costInCentsPerM: number;
costOutCentsPerM: number;
```

Il n'existe aucun champ de seuil, de palier ni de barème. Le calcul de coût
(`lineUserPrice`, `lineMargins`, le simulateur `/admin/agent-routing/simulate`)
multiplie un nombre de jetons par **ce** prix, quelle que soit la taille du
prompt.

## Ce que les fournisseurs font vraiment

Au moins un de nos fournisseurs facture par palier de taille de prompt.

| modèle | prompt ≤ 200 000 jetons | prompt > 200 000 jetons |
|---|---|---|
| `gemini-2.5-pro` | 125 / 1000 cents par million | **250 / 1500** |

Relevé sur `ai.google.dev/gemini-api/docs/pricing` le 2026-09-16.

## Pourquoi ça compte chez nous

`gemini-2.5-pro` est la ligne `fallback` — la redondance vers un second
fournisseur. Elle est facturée au multiplicateur ×1, soit 650 / 3250 à
l'utilisateur.

| | marge affichée par la carte | marge réelle au-delà de 200 k |
|---|---|---|
| entrée | 81 % | **62 %** |
| sortie | 69 % | **54 %** |

Et si cette ligne était un jour proposée en mode Lite (multiplicateur ×0,5,
soit 325 / 1625) :

| | marge affichée | marge réelle au-delà de 200 k |
|---|---|---|
| entrée | 62 % | **23 %** |
| sortie | 38 % | **8 %** |

Nous servons un IDE : un contexte de projet dépasse 200 000 jetons sans rien
d'exceptionnel. **La marge annoncée par la carte est donc un plafond, pas une
valeur**, dès qu'un modèle à palier est en jeu.

## Ce qui n'est PAS un remède

Inscrire le prix haut (250 / 1500) dans la carte « par prudence » remplace une
surestimation de marge par une sous-estimation de marge : la porte de marge
négative refuserait alors des configurations rentables. C'est exactement le
défaut qu'on vient de corriger sur la ligne `turbo`, où un coût surestimé de
25 % / 50 % faussait le verdict dans l'autre sens.

## Ce qu'il faudrait

Un barème par ligne — une liste de `{ seuilJetons, costIn, costOut }` — et un
calcul qui choisit le palier d'après la taille réelle du prompt, dans
`lineMargins` comme dans le simulateur. Tant que ce n'est pas fait, **toute
marge lue sur un modèle à palier doit être comprise comme la marge du petit
prompt.**

## Ce qui est tenu par un test

`packages/billing/src/tarifs-fournisseurs.spec.ts` vérifie que chaque ligne
porte le tarif relevé, et qu'aucune ligne active ne se vend à perte. Il compare
le **prix du petit prompt** : il ne détecte pas le dépassement de palier, et ne
prétend pas le faire.
