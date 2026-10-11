---
id: BUG-AUTH-CONNEXION-PERD-LA-LANGUE
section: "2026-10-11 — Dette d'infrastructure : la production sait des choses que le dépôt ignore"
---

## Bug

**`e-code.ai/login?lang=fr` ouvert sans cookie de langue arrivait sur `app.e-code.ai/login` EN ANGLAIS.**
La langue demandée ne survivait pas au saut d'hôte du domaine marketing vers l'application.

## La cause n'est pas un oubli — ce sont DEUX STRATÉGIES pour le même saut

C'est la partie qui resservira, et c'est pour elle que cette fiche existe.

Deux routes seulement franchissent ce saut d'hôte. **Mesuré sur `main` le 2026-10-11**, sur les 547 fichiers
de `app/routes/` :

```
  fichier         transmet-tout (requestUrl.search)   reconstruit (searchParams.set)
  login.tsx                    2                                   1
  signup.tsx                   1                                   0
```

```ts
// signup.tsx:85 — transmet TOUTE la chaine de requete, d'un bloc
return redirect(`${origineApplication}/register${requestUrl.search}`, { status: 301 });

// login.tsx:138 — construit une URL NEUVE, puis recopie ce qu'il connait
const loginUrl = new URL(`${origineApplication}/login`);
// ... searchParams.set('returnTo', returnTo)  <- et RIEN d'autre
```

`/signup` conserve `lang` **sans la connaître** : il ne la lit pas, il recopie `search` en entier. `/login`
**reconstruit** l'URL paramètre par paramètre — donc **tout ce qui n'est pas explicitement recopié est perdu,
en silence**.

**LA RÈGLE À RETENIR.** Une route qui reconstruit une URL à travers un saut d'hôte perd par défaut tout
paramètre qu'elle ne nomme pas. Ce n'est pas un bogue ponctuel, c'est le comportement normal de cette
stratégie — et il est invisible, parce qu'il ne produit aucune erreur : la page s'ouvre, simplement dans la
mauvaise langue. Pire, une route sœur qui transmet la chaîne entière **masque le problème** : on observe que
« ça marche sur `/signup` » et on en conclut que le mécanisme est partagé. Il ne l'est pas.

**Et le corollaire, qui est la vraie leçon** : un commentaire de correctif qui dit « comme sur `/signup` » est
faux dans son mécanisme tout en étant juste dans son effet. Vérifier l'affirmation d'un commentaire coûte un
`grep` ; la reprendre sans vérifier propage une compréhension fausse du code à tous ceux qui la liront
ensuite. Mesuré ici : le `grep` de `searchParams.set('lang'` dans `signup.tsx` rend **zéro**, avec son
contrôle positif (le fichier fait bien 430 lignes et il est lu).

## Portée de la famille — bornée, et c'est mesuré (règle 7)

**Deux routes, pas davantage.** `login.tsx` et `signup.tsx` sont les seules à appeler
`origineDeLApplication` puis à rediriger. Une seule portait le défaut. Il n'y a donc **pas de famille à
traiter**, mais la règle ci-dessus vaut pour la prochaine route qui franchira ce saut.

## 📤 Dispatché

☑ 11/10 correctif ouvert en **#698**

## 💻 Codé

☑ 11/10 `app/routes/login.tsx` (+12), `app/routes/login.spec.ts` (+60)

## ✅ Testé live

☐ en attente du déploiement

## Preuve

**Le correctif** — `normalizeSupportedLanguage` (présent sur `main`, `app/lib/i18n/language.ts`) n'accepte
qu'une langue prise en charge : une valeur arbitraire dans `?lang=` ne traverse pas la redirection.

**Épinglé par `app/routes/login.spec.ts`** (60 lignes), trois cas dont le négatif qui compte :

```
  garde ?lang=<langue> en redirigeant le domaine marketing vers la connexion
  garde la langue ET un returnTo sûr ensemble            (returnTo=/community préservé)
  ne recopie pas une langue inconnue ni une valeur arbitraire   <- sans lui, le correctif
                                                                  serait une porte ouverte
```

Sans le troisième cas, le correctif rendrait le paramètre recopiable tel quel. C'est lui qui transforme une
recopie en validation.

⚠️ **Ce qui n'a PAS été vérifié** : la suite complète n'a pas tourné localement (mémoire de la machine
saturée, swap à 12,3 Go). Le verdict est celui des contrôles de #698, et le ✅ live attend le déploiement.
