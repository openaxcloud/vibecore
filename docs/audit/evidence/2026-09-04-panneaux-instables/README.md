# Les quatre panneaux « instables » — relevé du 2026-09-04

**Conclusion : NON-DÉFAUT.** La « perte de 94–97 % du contenu entre deux
chargements identiques » se reproduit exactement comme l'écart entre **lire le
panneau avant que son contenu soit peint** et le lire après. Ce n'est pas le
produit qui perd son contenu, c'est la mesure qui arrive trop tôt.

## Environnement de la mesure (règle 11)

| | |
|---|---|
| Cible | env de test d'audit, `https://app.34.163.208.161.sslip.io` |
| SHA servi (web + api) | **`fce8639ab3`** |
| SHA servi (5 autres tiers) | `1c68880b39` — **hors `main`**, 621 commits de retard |
| Prod au même moment | `753b5ed38d` — soit **35 commits plus RÉCENTE** que l'env de test |
| Code du chemin mesuré | `api.projects.$projectId.ide-panel.$panel.ts` et la région `loadPanel`/cache de `BaseChat.tsx` sont **identiques octet pour octet** entre `fce8639ab3` et `origin/main` (`0189b2a70b`) — vérifié par `git diff` |
| Projet | créé à neuf pour la mesure, template `react-basic-starter` |
| Arbre local | sale (fichiers non suivis), mais aucune mesure ne dépend de l'arbre local |

## Ce qui a été mesuré

### 1. Au niveau de l'enveloppe HTTP — aucune instabilité

`panel-probe.mjs` (espacé) et `panel-burst.mjs` (concurrent) sur
`/api/projects/:id/ide-panel/:panel` :

| arm | charges | enveloppes `error` | variation de `data` |
|---|---:|---:|---|
| espacé | 4 | 0 | — |
| concurrent ×4 | 80 | **0** | **octet pour octet identique** |
| concurrent ×25 | 300 | **0** | **octet pour octet identique** |

Témoin de validité intégré : la sonde lit correctement un panneau connu bon
(`settings` → 200/`ok`) et ne confond pas un panneau inexistant avec un succès
(404). Sans ces deux témoins, un « 0 erreur » ne voudrait rien dire.

### 2. Au niveau du rendu — l'écart est temporel, pas aléatoire

`paint-timeline.mjs` échantillonne le MÊME panneau, sur le MÊME chargement, à
des instants croissants après l'apparition de la coque :

| panneau | 300 ms | 800 ms | 1,5 s | 3 s | 6 s | 10 s | « perte » si lu tôt |
|---|---:|---:|---:|---:|---:|---:|---:|
| `integrations` | 91 | 91 | 91 | 3055 | 3055 | 3055 | **97 %** |
| `overview` | 83 | 83 | 83 | 83 | 1063 | 1063 | **92 %** |
| `collaborators` | 1591 | 1591 | 1623 | 1623 | 1623 | 1623 | 2 % |

**92–97 % — exactement la magnitude rapportée.** Le plancher de 83–91
caractères est le même pour deux panneaux au contenu sans rapport : c'est un
état PARTAGÉ, donc l'en-tête + l'état de chargement, pas trois pertes de
contenu distinctes.

### 3. La capture tranche ce qu'aucun compteur ne pouvait trancher

`paint-overview-EARLY-900ms.png` : à 900 ms le panneau affiche un **état de
chargement honnête** — rouet, « Loading overview… », « Preparing panels, runtime
signals, and workspace data. », squelette. `paint-overview-LATE-10s.png` : à
10 s, le panneau est complet. Même chargement, seule la date de lecture change.

### 4. Contre-épreuve — l'enveloppe d'erreur ne peut PAS produire cette magnitude

Hypothèse écartée : « un appel amont échoue, `panelEnvelopeError` rend
`data:null`, le panneau se vide ». `blast-radius.mjs` force cette enveloppe
exacte (HTTP 200 + `status:'error'` + `data:null`) :

| panneau | rendu sain | rendu avec enveloppe d'erreur | perte réelle |
|---|---:|---:|---:|
| `integrations` | 3055 | 3135 | **−3 %** (le bandeau d'erreur AJOUTE du texte) |
| `collaborators` | 1623 | 1297 | 20 % |
| `packages` | 1207 | 1035 | 14 % |
| `overview` | 1063 | 745 | 30 % |

`blast-collaborators-err.png` montre pourquoi : le panneau garde tout son
échafaudage statique et ajoute un bandeau rouge explicite. **Une enveloppe
d'erreur coûte 14–30 %, jamais 94–97 %** — ce qui suffit à écarter cette cause.

## Conséquence pour l'instrument

Attendre `[data-testid="ide-service-panel"]` ne prouve **que** l'apparition de
la coque. Il faut attendre le CONTENU (ou au moins 6 s pour `overview`), sinon
un chargement lent est compté comme une perte de contenu. C'est ce qui produit
le motif bimodal « 239–258 vs 1374 » du relevé précédent.
