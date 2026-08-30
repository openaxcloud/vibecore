# SEC-RATE-001 — préserver l'IP source du client

**Statut : PRÊT, NON APPLIQUÉ.** En attente du feu vert d'Avi : ce changement
touche l'entrée réseau de toute la production.

## Ce qu'on corrige

Mesuré le 2026-08-30 : **60 tentatives de connexion depuis un seul client en
21 s, 56 traitées** pour un plafond de 10.

Prouvé à deux niveaux :

| source | ce qu'elle enregistre |
|---|---|
| journal de **nginx** | `10.10.15.212…217` — les IP des **nœuds GKE**, pour la totalité des requêtes |
| table **AuditLog** de l'API | les mêmes IP de nœuds ; seulement 6 hits pour une vraie IP publique |

Avec `externalTrafficPolicy: Cluster`, kube-proxy fait du SNAT dès qu'un paquet
franchit un nœud : l'adresse du client est remplacée **avant** nginx. Aucun
en-tête ne peut la récupérer — c'est pourquoi indexer le compteur sur
`X-Forwarded-For` ne corrigerait rien.

## La commande

```
helm upgrade ingress-nginx ingress-nginx/ingress-nginx \
  --version 4.15.1 -n ingress-nginx \
  -f infra/helm/ingress-nginx/values-prod.yaml \
  --kube-context connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
```

`--version` est **obligatoire** : sans lui, Helm prendrait la dernière version du
dépôt et embarquerait une montée de l'ingress controller de toute la production.

## Avant de lancer — relever le point de retour

```
helm -n ingress-nginx history ingress-nginx | tail -3
kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.spec.externalTrafficPolicy}{"\n"}'
```

Attendu avant : `Cluster`. Noter le numéro de révision Helm.

## Retour arrière

```
helm -n ingress-nginx rollback ingress-nginx <RÉVISION_NOTÉE> \
  --kube-context connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
```

Le retour est immédiat et sans perte : seule la politique de trafic change, ni
l'IP du LB, ni les certificats, ni les règles d'ingress ne sont touchés.

## Ce qu'il faut surveiller pendant

L'IP statique du LB **`34.1.6.93`** ne doit pas bouger — le DNS de `e-code.ai`,
`app.e-code.ai` et `api.e-code.ai` pointe dessus en direct, sans CDN devant.

```
watch -n5 "kubectl -n ingress-nginx get svc ingress-nginx-controller \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip} {.spec.externalTrafficPolicy}'"
```

Les sondes de santé GCP mettent quelques dizaines de secondes à retirer les nœuds
sans pod nginx. Une brève fenêtre d'erreurs 5xx pendant la bascule est attendue.

## La vérification à rejouer derrière

**1. L'IP vue par nginx doit redevenir publique**

```
kubectl -n ingress-nginx logs -l app.kubernetes.io/name=ingress-nginx --tail=40 \
  | awk '{print $1}' | sort | uniq -c | sort -rn | head
```

Attendu : des adresses publiques, **plus** des `10.10.15.x`.

**2. La mesure qui a révélé le défaut, rejouée à l'identique**

60 tentatives de connexion depuis un seul client, en rafale. Attendu : **au plus
10 traitées**, le reste en `429`.

```
for i in $(seq 1 60); do
  curl -s -o /dev/null -w "%{http_code} " -X POST \
    -H 'Content-Type: application/x-www-form-urlencoded' \
    --data-urlencode 'email=probe@invalid.test' \
    --data-urlencode 'password=x' https://app.e-code.ai/login
done; echo
```

**3. L'attribution dans le journal d'audit**

```
select "ipAddress", count(*) from "AuditLog"
where "createdAt" > now() - interval '10 minutes' group by 1 order by 2 desc;
```

Attendu : l'IP publique de l'appelant, **pas** une IP de nœud.

## Pourquoi `Local` ne dégrade pas la répartition ici

Le LB ne routera plus que vers les nœuds portant un pod nginx : il y en a **2**,
sur 2 nœuds distincts garantis par l'anti-affinité `required`. Les 4 autres ne
faisaient que relayer et SNATer — on supprime un saut inutile, pas un backend.
