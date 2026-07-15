# Phase 0 — Spike Nix : candidat E (magasin partagé en lecture seule)

> **Rien n'est codé hors l'image jetable de spike. Aucun fichier de prod touché.**
> Mon shell n'a ni `kubectl` ni `gcloud` : les commandes ci-dessous sont à exécuter par la session qui a l'accès cluster, et à me renvoyer brutes.
> Remplace la version précédente de ce document (candidats A/B/C/D).

---

## 1. Le trou dans le candidat E, à combler AVANT de commander un disque

Le candidat E est le bon, et pour la raison qu'Avi donne : plus de téléchargement, plus de compilation, `max-jobs = 0` trivialement satisfait. **Mais il y a une marche qu'il faut voir maintenant :**

> **Nix doit ÉCRIRE dans le magasin pour installer quoi que ce soit — même un paquet déjà présent.**
> `nix profile install nixpkgs#python312` ne se contente pas de « lier » : il **réalise un nouveau chemin de magasin** (la dérivation `buildEnv` du profil — l'arbre de liens symboliques). Sur un `/nix/store` strictement en lecture seule, cette commande **échoue**.

C'est *le* point qui décide si E marche. Deux réponses possibles, aucune n'exige overlayfs :

**E-1 — la ferme de liens en espace utilisateur (recommandé).** On n'utilise **pas** `nix profile`. On résout le chemin (le paquet est déjà dans le magasin), et on lie ses binaires dans un répertoire inscriptible du PVC :
```bash
P=$(nix eval --raw nixpkgs#python312)      # lecture seule, instantané, aucune écriture dans /nix
ln -sfn $P/bin/* /workspace/.ecode/bin/    # écriture dans le PVC existant → coût quota 0
export PATH=/workspace/.ecode/bin:$PATH
```
Zéro écriture dans `/nix`. Zéro build. Instantané. C'est un `buildEnv` fait à la main — et ça couvre **le besoin produit à ~100 %** (« ajoute ffmpeg » = le paquet est déjà là, on le lie).

**E-2 — montages scindés.** `/nix/store` en lecture seule (disque partagé) + `/nix/var` inscriptible (`subPath` du PVC existant → coût quota 0). La base de données Nix reste interrogeable, mais toute écriture *dans le magasin* échoue encore → il faut **quand même** E-1 par-dessus.

**À assumer explicitement en v1 : « l'utilisateur construit une dérivation absente du magasin » n'est PAS supporté.** C'est rare, et c'est la seule chose que E ne donne pas gratuitement. On l'ajoutera plus tard si — et seulement si — l'usage réel le réclame (règle : *ne rien construire qui ne soit pas prouvé utilisé*).

## 2. Quel disque ? Le choix de la primitive GCP est le vrai risque

| Primitive | Attache RO multi-nœuds | Adapté à un magasin Nix ? | Risque |
|---|---|---|---|
| **PD `ReadOnlyMany`** | oui, **mais plafonné en nombre d'instances** | oui (bloc, rapide) | ⚠️ **le plafond d'attaches est le blocage potentiel** — il doit couvrir tout le node-pool sandbox en pleine autoscale. **À VÉRIFIER EN PREMIER.** |
| **Hyperdisk ML** | conçu exactement pour ça (jeux de données RO partagés, attache massive) | oui | la bonne primitive si le PD plafonne. Coût à chiffrer. |
| **Filestore (NFS)** | pas de plafond | ⚠️ un magasin Nix = **des centaines de milliers de petits fichiers** ; NFS + le gofer gVisor = surcoût de métadonnées potentiellement rédhibitoire | à mesurer avant de s'engager |

**Ordre du spike : (1) le plafond d'attaches RO, (2) le montage sous gVisor non-root, (3) la latence réelle.**

## 3. Versionner le magasin : **append-only**, jamais de suppression

Un seul magasin monté à `/nix` (on ne peut pas en monter deux au même point). Donc :
- **On n'enlève jamais un chemin** (règle n°1 d'Avi, et celle de Replit).
- Faire évoluer nixpkgs = **snapshot du disque → nouveau disque enrichi → bascule des pods sur la nouvelle génération.** Les anciens chemins survivent → **aucun projet ne casse en silence.**
- La génération du disque est un numéro (`nix-store-gen-N`), pinné dans les values Helm — donc rollback = re-pointer sur `N-1`.

---

## 4. Le spike — 3 tests, dans cet ordre

### T1 — Le plafond d'attaches RO *(bloquant, à faire en premier, aucun pod requis)*
```bash
# Combien de nœuds sandbox en pleine autoscale ?
kubectl get nodes -l vibecore.ai/node-pool=sandbox --no-headers | wc -l
gcloud container node-pools describe <sandbox-pool> \
  --cluster=vibecore-prod-app --region=europe-west9 \
  --format='value(autoscaling.maxNodeCount)'
```
→ **Si le plafond d'attaches RO du PD est inférieur au `maxNodeCount` du pool sandbox, le PD est mort et il faut Hyperdisk ML.** À trancher sur la doc GCP + un test d'attache réel, pas sur mon souvenir.

### T2 — Un disque RO se monte-t-il à `/nix` dans un pod gVisor non-root ?

Disque de test **minuscule** (10 Go, pas 300) — on ne valide que le mécanisme :
```bash
# 1. disque source, formaté et pré-chargé, attaché temporairement à une VM jetable
gcloud compute disks create nix-store-spike --size=10GB --type=pd-balanced --zone=europe-west9-a
# ... (attacher à une VM, mkfs.ext4, installer Nix + python312/numpy/pandas dans /nix, détacher)

# 2. PV/PVC en ReadOnlyMany pointant sur ce disque
cat <<'EOF' | kubectl apply -f -
apiVersion: v1
kind: PersistentVolume
metadata: { name: nix-store-spike-pv }
spec:
  capacity: { storage: 10Gi }
  accessModes: [ReadOnlyMany]
  persistentVolumeReclaimPolicy: Retain
  storageClassName: ""
  csi:
    driver: pd.csi.storage.gke.io
    volumeHandle: projects/vibecore-495216/zones/europe-west9-a/disks/nix-store-spike
    readOnly: true
    fsType: ext4
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata: { name: nix-store-spike-pvc, namespace: workspaces }
spec:
  accessModes: [ReadOnlyMany]
  storageClassName: ""
  volumeName: nix-store-spike-pv
  resources: { requests: { storage: 10Gi } }
EOF
```

Pod de spike — **securityContext strictement identique à la prod** (`k8s-client:600-607`) :
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: spike-nix
  namespace: workspaces
  labels: { app.kubernetes.io/name: vibecore-workspace }
spec:
  runtimeClassName: gvisor
  nodeSelector: { vibecore.ai/node-pool: sandbox }
  tolerations:
    - { key: vibecore.ai/sandbox, operator: Equal, value: "true", effect: NoSchedule }
    - { key: sandbox.gke.io/runtime, operator: Equal, value: gvisor, effect: NoSchedule }
  automountServiceAccountToken: false
  securityContext:
    runAsNonRoot: true, runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: spike
      image: europe-west9-docker.pkg.dev/vibecore-495216/vibecore-prod-containers/spike-nix:v1
      command: ["sleep", "infinity"]
      securityContext:
        allowPrivilegeEscalation: false
        privileged: false
        capabilities: { drop: ["ALL"] }
      resources:
        limits: { cpu: "1", memory: 1Gi }        # limites du plan FREE — le pire cas
      volumeMounts:
        - { name: nix-store, mountPath: /nix, readOnly: true }     # ← LE test
        - { name: workspace, mountPath: /workspace, subPath: workspace }
  volumes:
    - name: nix-store
      persistentVolumeClaim: { claimName: nix-store-spike-pvc, readOnly: true }
    - name: workspace
      persistentVolumeClaim: { claimName: spike-workspace-pvc }
```

```bash
X() { kubectl exec -n workspaces spike-nix -c spike -- bash -lc "$1"; }

# le montage a-t-il seulement réussi ?
X 'ls -ld /nix /nix/store; mount | grep " /nix "; ls /nix/store | wc -l'
# lecture seule confirmée ?
X 'touch /nix/.probe && echo "ECRIVABLE (inattendu)" || echo "READ-ONLY (attendu)"'
```

### T3 — La preuve produit : E-1, zéro écriture, zéro build, instantané
```bash
X 'export PATH=/nix/var/nix/profiles/default/bin:$PATH; nix --version'

# résolution + ferme de liens (le vrai chemin produit)
X 'export PATH=/nix/var/nix/profiles/default/bin:$PATH; \
   mkdir -p /workspace/.ecode/bin; \
   time { P=$(nix eval --raw --offline nixpkgs#python312); ln -sfn $P/bin/* /workspace/.ecode/bin/; }; \
   PATH=/workspace/.ecode/bin:$PATH python3 --version'

# le point qui cassait sous Alpine
X 'PATH=/workspace/.ecode/bin:$PATH python3 -c "import numpy, pandas; print(numpy.__version__, pandas.__version__)"'

# et la contre-preuve : nix profile install DOIT échouer sur un magasin RO.
# Si ça réussit, mon analyse §1 est fausse et E-1 est inutile — dis-le-moi.
X 'export PATH=/nix/var/nix/profiles/default/bin:$PATH; nix profile install nixpkgs#python312 2>&1 | tail -5'

# cold start : pod supprimé → recréé → python3 utilisable
kubectl delete pod -n workspaces spike-nix --wait=true && kubectl apply -f /tmp/spike-nix-pod.yaml
time kubectl -n workspaces wait --for=condition=Ready pod/spike-nix --timeout=180s
```

**Ce que je veux recevoir (brut) :**

| # | Mesure | Verdict |
|---|---|---|
| T1 | plafond d'attaches RO vs `maxNodeCount` du pool sandbox | **PD ou Hyperdisk ML** |
| T2 | `mount \| grep /nix` + `ls /nix/store \| wc -l` | E monte-t-il sous gVisor non-root, oui/non |
| T3 | durée de `nix eval` + ferme de liens | l'instantanéité promise |
| T3 | `import numpy, pandas` → versions | le point qui cassait sous Alpine |
| T3 | sortie de `nix profile install` sur RO | confirme (ou infirme) §1 |
| T3 | pod Ready → `python3` utilisable | cold start < 15 s |

---

## 5. Le magasin pré-construit : contenu et fabrication

**Contenu v1 (ciblé, pas tout nixpkgs) — à figer avec Avi :**
Python 3.11/3.12 + les ~200 paquets PyPI les plus utilisés (numpy, pandas, requests, flask, fastapi, django, pillow, psycopg2, sqlalchemy, scipy…), Node 20/22 + pnpm/yarn/bun, Go, Rust, et les libs système courantes (ffmpeg, imagemagick, postgresql client, libpq, openssl…).

**Fabrication (une fois, sur une VM jetable) :**
```bash
nix build --no-link .#ecodeStoreClosure   # une expression qui liste tout le contenu voulu
nix copy --to file:///mnt/nix-store-disk $(nix path-info --recursive ...)
# puis : snapshot du disque → image → PV ReadOnlyMany
```
**Estimation de taille : 100–300 Go** → PD balanced ≈ **20–30 €/mois**, une fois, au niveau plateforme. À confirmer par un build réel du closure : `nix path-info -Sh` sur la liste.

---

# 6. Chapitre nettoyage — audit (état RÉEL, vérifié dans le code)

| Poste | État vérifié | Verdict |
|---|---|---|
| **Magasin Nix partagé** | n'existe pas encore | **on ne nettoiera PAS** — délibéré, append-only (§3). Coût maîtrisé par déduplication, pas par suppression. |
| **Workspace inactif** | `services/worker/src/index.ts:203` — `DEFAULT_IDLE_STOP_MS = 30 min`, réglable via `WORKSPACE_IDLE_STOP_MINUTES` ; suppression des STOPPED via `WORKSPACE_DELETE_STOPPED_HOURS` | ✅ **existe** — c'est là qu'on accrochera le `nix-collect-garbage` de la surcouche projet. **Pas de second cron.** |
| **PVC des workspaces supprimés (10 Gi pièce — le poste le plus cher)** | `manager.ts:698-703` — `deleteWorkspace` supprime bien Service + Pod + Secret + **PersistentVolumeClaim**, en `allSettled`, et les traînards sont balayés par `garbageCollect` | ✅ **couvert** |
| **Pods jetables des tâches planifiées** | `scheduled-jobs.ts:71-84,118-120` — `cleanup()` appelé **avant** ET dans un `finally` → supprimé en cas de **succès comme d'échec**, + backstop `activeDeadlineSeconds` | ✅ **couvert (point 3 d'Avi : vérifié, RAS)** |
| **Artifact Registry — 7 images par commit** | **aucune politique de rétention trouvée dans le dépôt** | 🔴 **croît sans borne.** À borner (`gcloud artifacts repositories set-cleanup-policies` : garder les 10 derniers SHA + tout ce qui est déployé). |
| **Déploiements arrêtés (Deployment/Service/Ingress/Secret orphelins)** | non audité — **appartient à la session deploy** | 🔴 à auditer (rapport à leur transmettre) |
| **Snapshots de disques, vieux logs, `UsageEvent`** | non audité | 🔴 à auditer + politique de rétention |

**Les deux seuls postes qui grossissent sans borne aujourd'hui : Artifact Registry et (probablement) les `UsageEvent`/logs.** Le reste est déjà couvert par du code qui existe et que j'ai lu. Je ne construis donc **rien** pour les postes déjà couverts.
