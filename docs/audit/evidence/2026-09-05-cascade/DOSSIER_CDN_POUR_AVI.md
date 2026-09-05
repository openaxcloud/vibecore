# Cache de bord : ce que ça change, ce que ça risque, ce que ça rapporte

Dossier de décision. **Rien n'a été mis en œuvre.** Mesures du 2026-09-05 sur
`app.e-code.ai` (production) ; les estimations sont annoncées comme telles.

---

## 1. Ce qui change exactement — et une mauvaise surprise

**L'hypothèse « c'est une case à cocher sur le service de backend » est fausse
pour cette infrastructure.** Mesuré :

```
gcloud compute forwarding-rules list --filter="IPAddress=34.1.6.93"
NAME        REGION        IP_PROTOCOL  SCHEME    TARGET   BACKEND_SERVICE
aca57507…   europe-west9  TCP          EXTERNAL  aca57507…   (aucun)
```

Et côté cluster : `ingress-nginx/ingress-nginx-controller`, `type: LoadBalancer`,
ports 80 et 443 en TCP.

C'est un **équilibreur réseau L4 en passthrough**, régional, sans service de
backend. **Cloud CDN ne peut pas s'y attacher** : il exige un équilibreur
**applicatif L7** avec un `backendService`. Il n'y a donc pas d'option à activer
sur l'existant.

### Les assets, eux, sont prêts

| chemin | `cache-control` mesuré |
|---|---|
| `/assets/*.js` (empreinte dans le nom) | `public, max-age=31536000, immutable` |
| revalidation `If-None-Match` | **304, 0 octet** |

Rien à changer côté application pour les rendre cachables au bord.

### Les trois chemins possibles

| | ce que ça demande | topologie |
|---|---|---|
| **A. CDN tiers devant l'origine** (Cloudflare, Fastly…) | un changement **DNS**, une règle de cache sur `/assets/*` | l'origine ne bouge pas |
| **B. Cloud CDN + nouvel équilibreur applicatif L7** | créer l'ALB, un backend vers l'ingress existant, basculer le DNS | ajoute une couche devant |
| **C. Migrer l'ingress vers L7 natif** (Gateway API / GCE Ingress) | porter toutes les annotations `ingress-nginx`, TLS, réécritures | remplace la couche d'entrée |

**A** est le moins invasif ; **C** le plus risqué et ne se justifie pas pour ce
seul objectif.

---

## 2. Le risque — et un défaut trouvé en le vérifiant

La règle doit ne porter **que** sur les chemins à empreinte, jamais sur le
document ni sur `/api/`. État mesuré :

| chemin | statut | `cache-control` | `set-cookie` |
|---|---:|---|---|
| `/` | 200 | **`no-store`** | — |
| `/assets/*.js` | 200 | `public, max-age=31536000, immutable` | — |
| `/api/health` | 200 | **aucun** | — |
| `/api/models/Anthropic` | 200 | **aucun** | — |
| **`/login`** | **200** | **aucun** | **`vc_upstream=…; Max-Age=3600; HttpOnly`** |

### Le point qui doit être traité AVANT toute mise en cache de bord

`/login` rend du HTML en 200, **sans `cache-control`**, et **pose un cookie**.
Le document racine `/` est protégé par `no-store` ; `/login` ne l'est pas. Il
porte `vary: Cookie, Accept-Language, Accept-Encoding`, ce qui atténue mais ne
suffit pas : la protection reposerait entièrement sur le mode de cache choisi au
bord, pas sur une instruction de l'application.

**Un cache de bord qui servirait cette réponse à un second visiteur lui
transmettrait le cookie du premier.** C'est infiniment pire que neuf secondes
d'attente — exactement le scénario à écarter.

**Deux garde-fous, à poser tous les deux :**

1. **Côté application** — `no-store` sur toute réponse HTML et toute réponse
   `/api/`, pas seulement sur `/`. C'est la protection qui tient même si la
   configuration du bord change plus tard, et elle ne dépend d'aucun
   fournisseur.
2. **Côté bord** — une règle **par chemin**, en liste blanche : mettre en cache
   `/assets/*` et rien d'autre. Jamais une politique « cache tout ce qui a l'air
   statique », qui décide par type de contenu et non par chemin.

Le premier garde-fou vaut d'être posé **même si le CDN n'est jamais activé**.

---

## 3. Ordre de grandeur du gain — **estimation, pas mesure**

Ce qui est **mesuré** en production (page publique, WebKit/iPhone, 2 échantillons) :

| | |
|---|---:|
| ressources statiques | 44 sur 48 |
| poids transféré, première visite | **1 235 Kio** compressés (5 069 Kio décompressés) |
| part statique du transfert | **100 %** |
| TTFB médian statique | **804 – 1 079 ms** |
| temps de **transfert** cumulé | 2 118 ms |
| temps mural | 2 500 – 3 190 ms |
| réseau oisif | 6 % |
| traitement serveur réel | ~10 – 20 ms (TTFB 93 ms pour 82 ms de RTT) |

Ce qui est **estimé** : un cache de bord ramènerait le TTFB des assets de
~800–1 080 ms à quelques dizaines de millisecondes. Le chargement est structuré
en **7 vagues successives**, chacune coûtant au moins un aller-retour.

> **Estimation : 1,5 à 2,5 secondes de moins sur la coquille de première
> visite.** Fourchette, pas mesure — elle sera à vérifier après coup.

### Trois réserves qui bornent cette estimation

- **Le CDN ne touche QUE le statique.** Les neuf secondes de la page projet
  contiennent des appels applicatifs (`ide-state`, archives) qui restent servis
  par l'origine. Le gain porte sur la coquille, pas sur la totalité.
- **Ma mesure s'arrête à l'événement `load`.** Le travail postérieur n'est pas
  compté.
- **Les 7 vagues viennent de l'environnement de test**, sur la page projet ;
  elles restent à confirmer sur la page projet de production.

---

## 4. Coût mensuel — ordre de grandeur

Base : **1,2 Mio compressés par première visite** (mesuré). Les tarifs sont des
ordres de grandeur à confirmer sur la grille Google du jour.

| premières visites / mois | volume | Cloud CDN (~0,08 $/Gio) |
|---:|---:|---:|
| 10 000 | 12 Gio | ~1 $ |
| 100 000 | 120 Gio | ~10 $ |
| 1 000 000 | 1,2 Tio | ~100 $ |

**Deux nuances qui comptent plus que ces chiffres :**

- Ce trafic est **déjà payé aujourd'hui** en sortie internet depuis
  europe-west9, à un tarif *supérieur* à celui du CDN. Sur la seule bande
  passante, l'opération est à peu près neutre, voire favorable.
- Le coût réel du chemin **B** n'est pas la bande passante mais **l'équilibreur
  applicatif lui-même** : de l'ordre de **20 $/mois** de règle de transfert,
  indépendamment du trafic. Le chemin **A** (CDN tiers) évite cette ligne — une
  offre d'entrée de gamme couvre ce volume sans frais.

---

## Ce que je recommande de décider, et ce qui n'est pas à moi

**À faire indépendamment de la décision CDN :** poser `no-store` sur les
réponses HTML et `/api/` qui n'en ont pas — `/login` en tête. C'est un correctif
d'application, il ne dépend d'aucun fournisseur, et il ferme le seul vrai risque
identifié.

**La décision CDN appartient à Avi.** Elle touche à la façon dont ses
utilisateurs reçoivent ses pages et elle implique un changement de topologie
réseau, pas une case à cocher. Rien n'a été mis en œuvre.
