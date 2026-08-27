# BUG-STORAGE-002 — dossier de revue expert (sécurité réseau)

**Correctif : branche `fix/np-metadata-workload-identity`, SHA `6a8e6a8a00`.**
**NON APPLIQUÉ.** Un seul fichier touché : `infra/helm/platform/templates/networkpolicy.yaml`
(+62 lignes, dont ~45 de commentaire).

---

## 1. La question posée, et la réponse

> Le stockage d'objets est-il cassé en production à cause de la NetworkPolicy
> anti-SSRF qui bloque `169.254.169.254` ?

**Non.** Mesuré depuis le pod API de production, deux fois à plusieurs heures d'écart :

| Test | Résultat |
|---|---|
| `GET /computeMetadata/v1/instance/service-accounts/default/email` | **HTTP 200 en 349 ms** → `vibecore-prod-platform@vibecore-495216.iam.gserviceaccount.com` |
| `GET .../default/token` | **HTTP 200**, expire dans 3581 s (re-mesuré : **344 ms**) |
| `GET storage.googleapis.com/storage/v1/b?project=…` | **HTTP 200 en 257 ms** |
| `GET …/b/vc-cmrsrzixn000f0nbfltqpabf4/o` (bucket projet réel) | **HTTP 200 en 106 ms**, 1 objet (`thumbnails/preview.png`) |
| Buckets `vc-*` existants en production | **14** |
| Erreurs GCS / credentials dans les logs API (2 h) | **0** |

La chaîne Workload Identity → GCS fonctionne de bout en bout en production.

Sur l'**environnement d'audit**, déployé depuis le chart, le même appel part en
**timeout à 9–10 s**.

## 2. La cause réelle : une dérive de configuration

La production porte une NetworkPolicy `allow-api-metadata-egress` :

- créée il y a **49 jours** ;
- **aucun label Helm** (`app.kubernetes.io/managed-by` absent) ;
- annotation `kubectl.kubernetes.io/last-applied-configuration` → posée par
  `kubectl apply`, à la main ;
- **absente du dépôt** (`grep -rn allow-api-metadata-egress` sur tout le repo : aucun résultat).

Conséquence : la production marche, mais **n'est pas reproductible**. Une
installation neuve, une reprise après sinistre ou tout nouvel environnement
repart avec un stockage d'objets cassé — ce qui est précisément l'état de
l'environnement d'audit.

Le risque n'est donc pas « la prod est cassée », c'est « la prod ne peut pas être
reconstruite à l'identique depuis le dépôt ».

## 3. Le correctif

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-metadata-egress
  labels:
    app.kubernetes.io/part-of: vibecore
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: api
  policyTypes: ["Egress"]
  egress:
    - to:
        - ipBlock:
            cidr: 169.254.169.254/32
      ports:
        - protocol: TCP
          port: 80
        - protocol: TCP
          port: 988
```

**Le rendu Helm est byte-identique à la règle qui tourne déjà en production**
(diff de `spec` : aucun écart). En production ce commit ne relâche donc rien : il
codifie l'existant. Le seul changement de comportement concerne les
installations neuves et les environnements de test.

## 4. Analyse de risque — ce que la revue doit trancher

### Ce que ça ouvre

Le pod `api` peut atteindre le serveur de métadonnées. Une SSRF applicative
depuis ce pod pourrait viser `169.254.169.254` pour exfiltrer un jeton Workload
Identity.

### Pourquoi c'est indispensable

Le serveur de métadonnées **EST** la source du jeton Workload Identity. Le
bloquer ne durcit rien : il rend tout appel GCP impossible. Il n'existe pas de
configuration où Workload Identity fonctionne sans cet accès.

### Portée du privilège accordé — vérifié sur le rendu, pas sur l'intention

| Contrôle | Résultat |
|---|---|
| Règles autorisant `169.254.169.254` après application | **1 seule** |
| Pods concernés | `app.kubernetes.io/name=api` **uniquement** (ni `web`, ni `worker`, ni `screenshotter`, ni `preview-proxy`, ni `admin`, ni `ai-gateway`) |
| Destinations | `169.254.169.254/32` — une seule adresse |
| Ports | 80 (metadata HTTP) et 988 (proxy GKE metadata server) — **pas 443** |
| `except 169.254.169.254/32` sur « 443 → 0.0.0.0/0 » (`allow-platform-required-egress`) | **conservé, pour TOUS les pods, `api` compris** |

### Défense en profondeur applicative (préexistante, indépendante du réseau)

Les chemins qui suivent une URL fournie par l'utilisateur rejettent déjà
loopback / link-local / privé / CGNAT / unique-local, **y compris** les
encodages qui replient vers `169.254.169.254` :

- `rejectInternalGitRemote` — `services/api/src/app.ts` (~ligne 2162) : rejette
  IPv4-mapped IPv6 (`[::ffff:169.254.169.254]`), 6to4 (`2002:a9fe:a9fe::`) et
  formes compactes (`::169.254.169.254` → `::a9fe:a9fe`) ;
- contrôle d'URL de `services/api/src/mcp-marketplace.ts` (~ligne 386) : impose
  `https` et bloque les hôtes internes/loopback/link-local/privés/metadata, avec
  le même repliement d'encodages.

### Questions ouvertes pour l'expert

1. Faut-il restreindre davantage — par exemple isoler l'accès metadata dans un
   sidecar ou un proxy dédié plutôt que de l'accorder au pod applicatif ?
2. L'inventaire des chemins de fetch pilotés par l'utilisateur est-il complet ?
   Deux gardes sont identifiés (git remote, MCP marketplace) ; d'autres surfaces
   (import de projets, connecteurs, webhooks sortants) méritent une relecture
   ciblée avec cette hypothèse : *le réseau n'est plus une barrière pour `api`*.
3. Le port 988 (proxy GKE) est-il nécessaire dans cette configuration de cluster,
   ou le port 80 suffit-il ? La règle de production porte les deux ; on la
   reproduit à l'identique plutôt que de la réduire sans preuve.

## 5. Piège opérationnel — à ne pas rater à l'application

L'objet existe déjà en production et **n'appartient pas à Helm**. Un
`helm upgrade` portant ce template échouera sur
`invalid ownership metadata … missing key "app.kubernetes.io/managed-by"`, et
comme le déploiement est `--atomic`, il **rollbackera**.

Adoption préalable, **une seule fois, avant le premier CD portant ce template** :

```bash
kubectl -n vibecore label networkpolicy allow-api-metadata-egress \
  app.kubernetes.io/managed-by=Helm
kubectl -n vibecore annotate networkpolicy allow-api-metadata-egress \
  meta.helm.sh/release-name=vibecore meta.helm.sh/release-namespace=vibecore
```

## 6. Comment reproduire les mesures

```bash
POD=$(kubectl -n vibecore get pods -l app.kubernetes.io/component=api \
  -o jsonpath='{.items[0].metadata.name}')

kubectl -n vibecore exec "$POD" -- node -e "
fetch('http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/email',
  {headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(8000)})
 .then(async r => console.log(r.status, (await r.text()).trim()))
 .catch(e => console.log('ÉCHEC', e.name));
"
```

Sur le cluster de production : `200` + identité du service account.
Sur un cluster déployé depuis le chart sans ce correctif : `TimeoutError`.

## 7. État

- Correctif **non appliqué**, `helm lint` vert dans les deux modes.
- Aucune modification de la production n'a été faite pendant l'investigation
  (mesures en lecture seule uniquement).
- Consigné dans `BUG_INVENTORY_LIVE.md` sous **BUG-STORAGE-002**.
