# Le repli fournisseur doit se mesurer sur la capacité, pas sur la disponibilité

**Proposition, pas correctif.** Elle demande un arbitrage produit et un coût
qu'Avi doit connaître avant qu'on écrive une ligne.

---

## Ce qui s'est passé le 2026-09-09

La clé Anthropic de la plateforme est tombée à court de crédit vers 14:00 :

```
WARN provider-fallback  Fournisseur [Anthropic] écarté 300s — credit : AI_APICallError
WARN provider-fallback  Génération redirigée : [Anthropic] écarté (credit) → [OpenAI]
```

Le repli automatique a fait son travail : il a basculé sur `gpt-4.1`, premier
maillon de `PROVIDER_FALLBACK_CHAIN`. **La plateforme n'est jamais tombée.**

Et pourtant, sur trois consignes substantielles enchaînées, elle a produit
**trois applications vides**. `gpt-4.1` répond par un plan d'architecture
d'environ 4 400 caractères, terminé par « Je passe maintenant à la phase
d'implémentation complète » — puis s'arrête. `finishReason=stop`,
`segments=0`, artefact 0 ouvert / 0 fermé, **zéro fichier écrit**.

L'utilisateur voit un plan et un projet vide. Rien ne lui dit que sa plateforme
tourne en mode dégradé.

---

## Le mécanisme, en une phrase

**La santé d'un fournisseur est mesurée sur sa disponibilité, jamais sur sa
capacité — un modèle qui répond « je vais le faire » puis s'arrête est, pour ce
mécanisme, parfaitement sain.**

`resolveRuntimeProvider` parcourt la chaîne et s'arrête au premier fournisseur
qui est *utilisable* et *sain* :

```js
for (const step of PROVIDER_FALLBACK_CHAIN) {
  if (!candidate || !isProviderUsable(...) || !isProviderHealthy(candidate.name, now)) continue;
  return { provider: candidate, … };   // ← s'arrête au PREMIER qui répond
}
```

`gpt-4.1` répond. Il ne lève aucune erreur, ne consomme aucun crédit épuisé,
n'est jamais marqué malade. **Il échoue seulement à la tâche.**

---

## Conséquence mesurée : la redondance est décorative

La chaîne compte deux maillons — `OpenAI/gpt-4.1` puis `Google/gemini-2.5-pro`.

Le second est **parfaitement configuré** : clés présentes
(`GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_GEMINI_API_KEY`), `gemini-2.5-pro`
déclaré au registre, `resolveChainModel` le trouverait sans repli.

Et il n'a **jamais servi une seule fois** — zéro génération au registre de coûts
sur toute la période conservée. Ce n'est pas un défaut de configuration : c'est
la preuve que le second cran est **inatteignable par construction** tant
qu'OpenAI est debout.

**Deux maillons, un seul joignable, et l'illusion d'une redondance.**

---

## La proposition

Le produit sait désormais détecter cette condition. La garde livrée le même jour
(`generation-incomplete.ts`, critère `aucunFichier`) répond exactement à la
question : *cette génération a-t-elle écrit au moins un fichier ?*

Ce signal peut servir **deux fois** :

1. **Dire la vérité à l'utilisateur** — c'est ce qu'il fait déjà.
2. **Marquer le fournisseur comme inapte à la tâche**, ce qui ferait avancer la
   chaîne au maillon suivant.

Concrètement : une génération en mode construction qui se termine avec zéro
fichier écrit appelle `markProviderUnhealthy(provider, 'incapable', ttl)`, au
même titre qu'un `credit` ou un `rate-limit`. Le tour suivant part chez le
candidat d'après.

**La capacité devient alors mesurable par le produit lui-même, sur son propre
résultat, sans avoir à la deviner à l'avance.** Un fournisseur qui rend zéro
fichier sur une consigne de construction est inapte à cette tâche, quel que soit
son état de santé réseau.

---

## Le coût, et les limites honnêtes

**Ce que ça coûte.** Une génération est « perdue » pour établir l'inaptitude —
l'utilisateur voit une réponse vide avant que la bascule n'opère. Un TTL trop
court refait la dépense à chaque tour ; trop long, il écarte un fournisseur
redevenu bon.

**Si Gemini est lui aussi incapable**, la chaîne finira par échouer franchement.
C'est **préférable à une application vide** — un message « service temporairement
indisponible » ne fait pas douter du produit entier — mais **ça change ce que
voit l'utilisateur**, et cette décision revient à Avi.

**Le faux positif à craindre.** Une consigne qui n'appelle légitimement aucun
fichier — une question, une explication — ne doit pas déclarer le fournisseur
inapte. Le critère doit donc être restreint au **mode construction**, là où
l'absence de fichier est un échec par définition.

**Ce qui n'est pas mesuré.** Je n'ai pas pu établir si `gemini-2.5-pro` écrit
réellement des fichiers : la mesure demande des générations, et le crédit
Anthropic manquant fausse toute comparaison. Sans ce chiffre, on ne peut pas
promettre que la bascule améliore quoi que ce soit — seulement qu'elle cesse de
s'arrêter au premier maillon défaillant.

---

## Dette de fiabilité, indépendante du reste

`gemini-2.5-pro` n'a **jamais** été exercé en production. Le chemin de repli de
second niveau n'est donc pas seulement inatteignable : il est **non testé**. Le
jour où il servira — parce qu'on aura corrigé la bascule, ou parce qu'OpenAI
tombera — personne ne sait ce qui se passera.

C'est une dette distincte des deux défauts ci-dessus, et elle se solde sans eux :
il suffit d'exercer ce chemin une fois, délibérément, et de consigner le
résultat.
