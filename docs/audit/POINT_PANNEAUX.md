# Point sur les panneaux de l'IDE

**Date du relevé : 2026-09-01.** Document **créé ce jour** — il n'avait jamais
existé, malgré avoir été annoncé plusieurs fois.

## Barème, et pourquoi il est strict

| état | ce que ça veut dire |
|---|---|
| ✅ | **preuve datée en production** : ouvert en réel, sur les 4 formats, en clair ET en sombre |
| 🔧 | s'ouvre et rend du contenu, mais un défaut est nommé |
| ❌ | ne s'ouvre pas, ou rend vide, avec le défaut nommé |
| ❓ | **inconnu — jamais vérifié**. Pas un jugement : une absence de mesure |

⚠️ **« Sur `main` » n'est pas « vérifié en ligne ».** Un panneau dont le code est
mergé, et même déployé, reste ❓ tant que personne ne l'a ouvert en production. La
confusion entre les deux est ce qui a permis d'annoncer ce document comme
existant alors qu'il n'existait pas.

⚠️ **Mesures à refaire.** Toute mesure prise le 2026-09-01 **entre ~12 h 29 et
22 h 32 UTC** l'a été pendant que la génération IA était cassée (BUG-AI-001 :
chemin non-streaming en 500, chemin streaming en 200 à zéro octet). Les panneaux
qui dépendent de l'agent y étaient observés dans un produit malade. Ces mesures
sont marquées **à refaire** et ne valent pas certification.

## Méthode

Session de test ouverte selon `docs/runbooks/PROTOCOLE_PREUVE_PROD.md`, révoquée
après usage. Pour chaque panneau, ouverture réelle de
`https://app.e-code.ai/projects/<id>/ide?panel=<clé>` en **390 / 768 / 1024 /
1440 px**, en thème **clair** et **sombre** — soit 8 combinaisons par panneau.

Mesuré à chaque combinaison : statut HTTP, présence de la coque IDE
(`.bolt-project-ide-panels`), quantité de texte réellement rendu, débordement
horizontal, erreurs console et `pageerror`.

## Périmètre demandé, et une correction

Dix surfaces étaient demandées. **Neuf sont des panneaux adressables** ; la
dixième, « Partager », **n'en est pas un** : c'est une action du panneau Agent
(partage d'une conversation en lien de lecture seule), sans clé `?panel=`. Elle
est suivie à part.

| demandé | clé de panneau |
|---|---|
| Verrous | `locks` |
| Secrets | `secrets` |
| Collaborateurs | `collaborators` |
| Journaux | `logs` |
| Paquets | `packages` |
| Intégrations | `integrations` |
| Variables d'environnement | `env` |
| Extensions | `extensions` |
| Vue d'ensemble | `overview` |
| Partager | *(action du panneau Agent, pas un panneau)* |

## Résultats — relevé du 2026-09-01, 72 combinaisons

SHA servi au moment du relevé : **`a354779a3c`**.

| panneau | état | mesure |
|---|:---:|---|
| `locks` | 🔧 | HTTP 200 × 8. Rendu **confirmé par capture** en 390 clair : en-tête, recherche, filtre, état vide « No locked items found ». Non certifiable — voir BUG-IDE-010 |
| `secrets` | 🔧 | HTTP 200 × 8, conteneur de service présent × 8, 0 erreur, 0 débordement. Non certifiable — BUG-IDE-010 |
| `collaborators` | 🔧 | HTTP 200 × 8. Contenu **incohérent à format constant** : 268 caractères en clair/390 contre **1717** en sombre/390 — le thème n'y est pour rien |
| `logs` | 🔧 | HTTP 200 × 8, stable (250 / 679-695). Non certifiable — BUG-IDE-010 |
| `packages` | 🔧 | HTTP 200 × 8. 239-258 à ce passage, **1374** au passage précédent aux mêmes largeurs |
| `integrations` | ❌ | **expiration de navigation à 45 s** en sombre/390 (HTTP 0, page jamais chargée) ; 1 erreur console en sombre/1024 |
| `env` | ❌ | **3 erreurs console** en clair/1440, 1 en clair/1024. Contenu variable : 265 / 284 / 434 / 853 / 952 |
| `extensions` | 🔧 | HTTP 200 × 8. **3674 ou 243** caractères aux mêmes largeurs selon le passage |
| `overview` | 🔧 | HTTP 200 × 8, stable (239-258 / 658-709). Non certifiable — BUG-IDE-010 |
| *Partager* | ❓ | **n'est pas un panneau** — action du panneau Agent, sans clé `?panel=`. Jamais vérifiée |

### Pourquoi aucun ✅

Aucun panneau ne peut être certifié tant que **BUG-IDE-010** n'est pas corrigé : l'état de l'IDE (fichier sélectionné, vue courante, éléments verrouillés) **peut ne jamais être restauré**, silencieusement. Cocher « vérifié » sur un produit qui perd son état par intermittence serait pire que ne rien cocher.

⚠️ **Limite de méthode assumée** : le marqueur de présence employé (`[data-testid="ide-service-panel"]`) ne couvre **pas** `locks`, qui appartient à `IDE_WORKSPACE_PANELS` et non aux panneaux de service. Son rendu est établi par **capture**, pas par ce marqueur. Ne pas relire `coque=NON` comme un défaut.

## Compteurs

| | |
|---|---:|
| panneaux demandés | 10 |
| dont réellement adressables | **9** |
| ✅ certifiés | **0** |
| 🔧 s'ouvrent, défaut nommé | **7** |
| ❌ défaut bloquant | **2** (`integrations`, `env`) |
| ❓ jamais vérifié | **1** (*Partager*) |
| combinaisons mesurées | **72** (9 × 4 formats × 2 thèmes) |
| HTTP 200 | 71 / 72 |
| débordement horizontal | **0** |

---

# Famille A — ce qui n'apparaît qu'au survol ou au focus

Mort sur Safari iOS : un pointeur tactile n'a **pas** d'état de survol, et le
focus n'arrive qu'**après** le toucher — trop tard pour révéler ce qu'il fallait
voir avant de toucher.

## Forme de référence — elle existe déjà, et presque personne ne s'en sert

`useCoarsePointer()` / `resolveCoarsePointer()` / `COARSE_POINTER_QUERY`,
correctement écrite et documentée :

```tsx
const coarse = useCoarsePointer();
className={classNames(coarse ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
```

⚠️ **Défaut structurel** : cette primitive est exportée depuis
`app/components/sidebar/HistoryItem.tsx` — un **fichier de composant**, pas un
module de hooks partagé. C'est très probablement pourquoi elle n'est employée
que par **deux** composants. La déplacer dans `app/lib/hooks` ferait plus pour
l'adoption que n'importe quelle correction ponctuelle.

## Relevé

| composant | état | constat |
|---|:---:|---|
| `chat/UserMessage.tsx` | ✅ | `coarse ? 'opacity-100' : …` — la forme juste |
| `sidebar/HistoryItem.tsx` | ✅ | porte la primitive |
| `chat/CodeBlock.tsx` | 🟠 | `opacity-100 sm:opacity-0 sm:group-hover:…` — visible sur mobile, mais **masqué sur tablette tactile** (≥640 px), où il n'y a pas plus de survol |
| `database/QueryHistoryControl.tsx` | ❌ | bouton **supprimer** (`onRemove`) en `opacity-0`, révélé au survol. `focus-visible:opacity-100` sauve le clavier, **pas le tactile** : au doigt, le bouton est invisible avant d'être touché |
| `@settings/tabs/profile/ProfileTab.tsx` | 🟠 | pastille appareil photo sur l'avatar, invisible au tactile — l'action reste probablement atteignable, l'**indice** ne l'est pas |

⚠️ Relevé par **lecture des composants**, pas par recherche textuelle seule : la
recherche donne des faux positifs (décor) et des faux négatifs (borne portée par
une primitive partagée). Leçon payée deux fois aujourd'hui.

---

# Famille B — surfaces flottantes sans hauteur bornée ni défilement

Relevé complet, forme de référence et répartition : voir le lot **SURF-2026-09**
dans `DESIGN_PROGRAM_MASTER.md`.

Résumé : **26 candidates** par recherche textuelle, dont l'écrasante majorité
sont des **faux positifs** (décor positionné en absolu). Après ouverture des
composants : **3 primitives correctes** (`ui/Dropdown`, `AvatarDropdown`,
`BranchSelector`), **1 à mi-chemin** (`ModelSelector`, borne en pixels fixes) et
**1 réellement défectueux** (`TerminalTabs` — largeur bornée, hauteur non),
corrigé en PR #367.

---

# Famille C — un garde posé AVANT le succès

**Troisième occurrence de la journée.** Le motif : une référence est posée à
l'**entrée** d'une opération asynchrone pour empêcher un second passage, puis
l'opération échoue ou est annulée — et le garde reste revendiqué. L'opération
n'est **jamais** retentée, silencieusement.

## La règle

> **Tout chemin d'échec ou d'annulation doit RENDRE le loquet.**

⚠️ *Énoncé corrigé.* J'avais d'abord écrit « ne poser le loquet qu'après un
succès constaté ». C'est **faux**, et le vérifier en appliquant la forme de
référence l'a montré : la poser à l'entrée est ce qui empêche deux exécutions
concurrentes, et le modèle du dépôt le fait. Le défaut n'est pas la **pose**,
c'est l'**absence de restitution**. Corriger l'énoncé importe : la première
version aurait fait supprimer une protection utile.

Corollaire, qui est la vraie leçon du jour : **ne jamais déduire le succès de
l'absence d'un signal d'échec.** Poser le garde à l'entrée, c'est exactement
cela — parier que ça va marcher.

## Forme de référence — UNE SEULE, et ce n'est pas la mienne

J'avais écrit une primitive générique `executerSousLoquet`, puis je l'ai supprimée
pour éviter un doublon — ce qui a fait que ce travail n'existait plus **nulle
part** hors d'un worktree local. Mauvais réflexe : on ne supprime pas, on
**pousse et on converge**. Elle est livrée, avec sa note de convergence : la session Agent en a produit une plus forte dans #371
(`project-ide-restore-guard.ts`), et deux primitives concurrentes pour un même
motif seraient exactement le prochain problème.

La comparaison, faite en lisant les deux :

| | la mienne | celle de #371 |
|---|---|---|
| « en vol » et « réussi » | **confondus** en un seul booléen | **séparés** |
| libération sur échec | oui | oui |
| jeton d'identification de la tentative | **non** | oui |

Le jeton n'est pas un raffinement : sans lui, la fin d'une tentative **annulée**
libère la tentative suivante. Et la confusion « en vol / réussi » ouvre une perte
silencieuse dans la mienne — un appelant refusé pendant le vol n'est jamais
rejoué, alors que le loquet est ensuite rendu. **Le garde de #371 est
strictement meilleur — c'est donc lui qui doit survivre à la convergence.**

**Règle de convergence, notée sur #371 : celle des deux qui atterrit la première
fait converger l'autre.** Si #371 atterrit d'abord : promouvoir `creerGardeDeRestauration` dans
`app/lib/hooks` sous un nom générique, et y rattacher les consommateurs
corrigés ici. Les correctifs de `VercelConnection` et `SettingsTab` restent
justes quelle que soit la primitive retenue : ils libèrent dans le `catch`.

**Une primitive introuvable est une primitive inexistante** — mais deux
primitives trouvables pour un même motif sont pires. Même constat que pour
`useCoarsePointer`, qui dormait dans un composant de barre latérale.

L'original, qui reste juste :

```ts
void hydrate().catch((error) => {
  if (unmountedRef.current) return;
  /*
   * Release the latch so the conversation can be hydrated again on the next
   * effect run. A returning user with a real (but transiently unreachable)
   * transcript must never be left with a silently-empty chat panel.
   */
  hydratedRef.current = false;
  ...
});
```

## Relevé — 9 candidats détectés, 3 réels

Recherche systématique sur `app/` et `services/`, **hors `BaseChat.tsx`** (session
Agent). Les 9 candidats ont été **ouverts un par un** : la détection textuelle
seule aurait donné 9 défauts là où il y en a 3.

| site | verdict | constat |
|---|:---:|---|
| `useProjectAiTranscriptHydration.ts:82` | ✅ | libère le loquet dans le `catch` — **le modèle** |
| `@settings/.../VercelConnection.tsx:51` | ❌ | `hasInitialized.current = true` avant `await autoConnectVercel()`. Garde de sortie ligne 39. **Jamais libéré** — ni `catch`, ni `finally`. Une auto-connexion qui échoue n'est **plus jamais** retentée |
| `@settings/tabs/settings/SettingsTab.tsx:183` | 🔧 | `lastPersistedRef.current = snapshot` avant `persistPreferencesToBackend()`. Le `.catch` affiche « échec de synchronisation » mais **ne libère pas** : sans nouvelle modification, le réglage reste désynchronisé. *Atténuation possible ligne 132-137 (réconciliation serveur) — à vérifier avant correction* |
| `chat/Chat.client.tsx:566` | ✅ | `pendingPersistRef` est un **tampon**, pas un garde |
| `connector-cards/ConnectionRequestCard.tsx:98` | ✅ | rappel **synchrone** ; l'`await` détecté est dans une autre fonction |
| `workbench/ScreenshotSelector.tsx:105` | ✅ | stocke un nœud DOM |
| `routes/notifications.tsx:234` et `:386` | ✅ | stockent un `AbortController` pour l'annuler ensuite |
| `@settings/tabs/update/UpdateTab.tsx:131` | ✅ | suivi de progression, pas un garde |

⚠️ **6 faux positifs sur 9.** Encore une fois : la recherche textuelle localise,
elle ne conclut pas. Ouvrir le fichier reste obligatoire.

## Hors périmètre

`BaseChat.tsx:4972` (`restoredProjectId`) est le cas qui a mené ici — état de
l'IDE jamais restauré, panneaux incomplets par intermittence. Il appartient à la
session Agent, qui instruit une piste voisine sur `useChatHistory` /
`chatMetadata`. Non traité ici.

---

## 2026-09-05 — CLÔTURE : il n'y avait pas de panneau cassé, il y avait un observateur trop pressé

Le sujet ouvert le 2026-09-01 — « quatre panneaux perdent 94 à 97 % de leur
contenu entre deux chargements identiques » — est **clos comme NON-DÉFAUT**.
Cette formulation a été relayée plusieurs fois ; elle était fausse.

**Ce qui se passait.** L'instrument attendait l'apparition de la COQUE
(`[data-testid="ide-service-panel"]`) puis lisait le texte. Or la coque paraît
plusieurs secondes avant le contenu. Sur le MÊME chargement du MÊME panneau :
`integrations` passe de 91 à 3 055 caractères entre 1,5 s et 3 s, `overview` de
83 à 1 063 entre 3 s et 6 s. Lire tôt donne **97 %** et **92 %** de « perte » —
exactement la magnitude rapportée. Le plancher de 83-91 caractères était
PARTAGÉ par des panneaux au contenu sans rapport : un état commun de
chargement, pas trois pannes distinctes. La capture à 900 ms montre un rouet et
« Loading overview… ».

**Passe complète du 2026-09-05**, production `a00ccb761e`, iPhone 13, 12 s entre
chargements, page neuve par panneau, attente de la STABILISATION DU CONTENU :

> **9 panneaux sur 9 rendent leur contenu. 0 erreur console. 0 débordement.**

`logs` 3,7 s · `env` 4,4 s · `extensions` 4,6 s · `secrets` 4,8 s ·
`collaborators` 4,8 s · `settings` 5,3 s · `integrations` 8,7 s ·
`overview` 9,2 s · `packages` 9,2 s.

Chiffres et méthode : `docs/audit/evidence/2026-09-05-reference/`.

**La leçon, plus large que ce tableau** : attendre la coque n'est pas attendre
le contenu, et un panneau lent est indiscernable d'un panneau vide pour qui
mesure trop tôt. Trois faux échecs supplémentaires ont été produits par le
détecteur AVANT qu'il fonctionne — voir les entrées 22 à 25 du registre des
faux négatifs.
