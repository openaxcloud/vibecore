# Rotation des quatre clés de fournisseurs LLM

**Pour Avi. Ne pas exécuter à sa place** — la régénération engage les comptes
fournisseurs, c'est un geste qui lui appartient.

**Motif** : le 2026-09-01, une commande `printenv | grep -i api` lancée dans le
pod `worker` pour diagnostiquer une variable manquante a fait ressortir quatre
clés **en clair** dans un transcript de session. Aucune preuve d'un usage
malveillant ; la rotation est une précaution, pas une réponse à un incident.

**Clés concernées** — toutes dans le Secret `vibecore-platform-secrets`
(namespace `vibecore`, 49 clés au total) :

| Variable | Fournisseur | Où régénérer |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic | console.anthropic.com → **Settings → API keys** → *Create key*, puis révoquer l'ancienne |
| `XAI_API_KEY` | xAI | console.x.ai → **API Keys** → *Create*, puis supprimer l'ancienne |
| `MOONSHOT_API_KEY` | Moonshot | platform.moonshot.cn → **API Keys** → *Create*, puis supprimer l'ancienne |
| `GOOGLE_GEMINI_API_KEY` | Google AI Studio | aistudio.google.com/apikey → *Create API key* (projet `vibecore-495216`), puis supprimer l'ancienne |

---

## Ordre imposé : créer d'abord, basculer, révoquer ensuite

Révoquer avant d'avoir basculé coupe la génération pour tous les utilisateurs.
Les quatre fournisseurs acceptent plusieurs clés actives simultanément.

### 1. Créer les nouvelles clés

Une par fournisseur, sans toucher aux anciennes. Les garder hors de tout
terminal partagé — pas de `echo`, pas d'historique shell.

### 2. Mettre à jour le Secret Kubernetes

Contexte : `connectgateway_vibecore-495216_europe-west9_vibecore-prod-app`.

**Ne pas utiliser `kubectl edit`** : le Secret contient 49 clés et une faute de
frappe en casse quatre à la fois. Patcher clé par clé, en lisant la valeur
depuis un fichier pour qu'elle n'apparaisse ni dans l'historique ni à l'écran :

```bash
# Écrire la clé dans un fichier temporaire, hors historique (noter l'espace
# initial, qui empêche l'enregistrement dans l'historique zsh/bash).
 printf '%s' 'NOUVELLE_VALEUR' > /tmp/k && chmod 600 /tmp/k

kubectl -n vibecore patch secret vibecore-platform-secrets \
  --type=json \
  -p="[{\"op\":\"replace\",\"path\":\"/data/ANTHROPIC_API_KEY\",\"value\":\"$(base64 -i /tmp/k | tr -d '\n')\"}]"

rm -P /tmp/k
```

Répéter pour `XAI_API_KEY`, `MOONSHOT_API_KEY`, `GOOGLE_GEMINI_API_KEY`.

**Vérifier sans afficher la valeur** — comparer les empreintes :

```bash
kubectl -n vibecore get secret vibecore-platform-secrets \
  -o jsonpath='{.data.ANTHROPIC_API_KEY}' | base64 -d | shasum -a 256
```

### 3. Redémarrer les services qui lisent le Secret

Les **huit** Deployments montent `vibecore-platform-secrets` via `envFrom`, donc
les variables ne sont lues **qu'au démarrage du conteneur**. Un patch de Secret
seul ne change rien tant que les pods tournent.

En pratique, seuls trois consomment réellement ces quatre clés — mais redémarrer
les huit évite de raisonner sur qui lit quoi, et le rollout est sans coupure
(`maxUnavailable: 0` + `preStop`, actif depuis `5c2c3586`) :

```bash
for d in api web worker ai-gateway admin preview-proxy screenshotter workspace-manager; do
  kubectl -n vibecore rollout restart deploy/vibecore-vibecore-platform-$d
done

for d in api web worker ai-gateway admin preview-proxy screenshotter workspace-manager; do
  kubectl -n vibecore rollout status deploy/vibecore-vibecore-platform-$d --timeout=5m
done
```

⚠️ **Ne pas passer par `helm upgrade`** pour ceci. Le Secret est géré hors du
chart ; un `helm upgrade --reuse-values` risque de réécrire le Secret avec les
valeurs de `values-prod.yaml`, donc de **restaurer les anciennes clés**.

### 4. Prouver que la nouvelle clé sert

Avant de révoquer quoi que ce soit — une génération réelle sur la production,
et vérifier qu'un fichier est bien produit. Le symptôme d'une clé morte est un
« Service unavailable » à la génération.

### 5. Seulement alors, révoquer les anciennes

Dans les quatre consoles. Si une révocation casse quelque chose, il reste la
possibilité de recréer immédiatement.

### 6. Après coup

Vérifier qu'aucun `403`/`401` fournisseur n'apparaît dans les journaux
`ai-gateway` et `web` dans l'heure qui suit.

---

## Ce qui ne change pas

Les 45 autres clés du Secret ne sont pas concernées et ne doivent pas être
touchées. Aucun redéploiement d'image n'est nécessaire : seul le contenu du
Secret change.
