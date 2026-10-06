---
id: DETTE-IMAGE-DE-BASE-NON-FIGEE-001
section: "2026-10-06 — Chaîne de livraison : porte de vulnérabilité"
---

# DETTE-IMAGE-DE-BASE-NON-FIGEE-001

**Nature** — DETTE, et c'est un **état qui bouge sans trace**. Pas un défaut à corriger dans
l'urgence, mais la même famille que ce qu'on a traqué toute la semaine.

**État** — 📤 consigné le 2026-10-06 · 💻 non codé · ⬜ non testé live.

## Le fait

Les deux chaînes de construction désignent leur image de base par un **tag mobile** :

| fichier | ligne | base |
|---|---|---|
| `Dockerfile` | 19 et 95 | `node:22-bookworm-slim` |
| `infra/docker/node-service.Dockerfile` | 54 | `node:22-bookworm-slim` |

**Aucune empreinte.** Deux constructions du **même commit**, à deux semaines d'intervalle,
peuvent donc produire des images dont les paquets système diffèrent — sans qu'aucun commit
n'explique l'écart.

## Pourquoi ça compte, au-delà de la théorie

Mesuré le 2026-10-06, et c'est ce qui a rendu le sujet concret : la porte de vulnérabilité a
refusé le déploiement sur **`perl-base` 5.36.0-7+deb12u3** (CVE-2026-13221, CRITIQUE), un
paquet venu de cette base. Le correctif `deb12u4` était **déjà publié** dans
`bookworm-security`, et `bookworm-security` était **déjà** dans les sources apt de l'image.

La mise à jour des paquets corrige ce cas (voir `tests/guards/image-de-base-a-jour.spec.ts`).
**Elle ne corrige pas la dette** : la version de départ reste décidée par ce que le tag
pointait ce jour-là.

**Les trois conséquences, dans l'ordre de gravité :**

1. **Une construction n'est pas reproductible.** Reconstruire un commit ancien pour un
   diagnostic ou un retour arrière ne rend pas la même image.
2. **Un retour arrière par empreinte reste sûr, un retour arrière par tag ne l'est pas.** Le
   déploiement épingle bien les images par empreinte — donc le risque ne porte pas sur le
   rollback, mais sur ce que produit la **prochaine** construction.
3. **Un changement de comportement peut apparaître sans auteur.** C'est exactement le motif
   qu'on a payé trois fois cette semaine : des exemptions i18n expirées, une dérogation
   arrivée à terme, une CVE publiée — trois rouges sans qu'une ligne de code ne change.

## Ce qu'il faudrait faire

Épingler par empreinte (`node:22-bookworm-slim@sha256:…`) dans les deux fichiers, et faire
remonter les mises à jour par un **commit** — donc par une proposition relisible — plutôt que
par le hasard du moment de construction.

## Pourquoi ce n'est pas fait ici

Parce que l'épinglage **sans** mécanisme de remontée est pire que le tag mobile : l'image se
fige à une version qui vieillit, et les correctifs de sécurité cessent d'arriver. Il faut
donc les deux en même temps — l'épinglage **et** la façon de le faire bouger :

* soit une mise à jour périodique de l'empreinte, proposée automatiquement et relue ;
* soit un contrôle qui rougit quand l'empreinte épinglée a plus de N jours.

Poser l'épinglage seul, aujourd'hui, échangerait un défaut connu contre un défaut silencieux.
C'est l'arbitrage exact qu'on a refusé pour le cache des durées de tranches
(`DETTE-CI-TRANCHES-DESEQUILIBREES-001`) : on ne remplace pas un déséquilibre visible par un
déséquilibre qui dépend d'un cache.

## Mesure à refaire avant de se lancer

Combien de constructions du **même** commit produisent des paquets système différents ?
L'historique des empreintes du registre et les SBOM déjà publiés par la chaîne
(`Upload release manifest and SBOMs`) permettent de le chiffrer **sans rien construire**.
Sans ce chiffre, on ne sait pas si la dette coûte une surprise par an ou une par semaine.
