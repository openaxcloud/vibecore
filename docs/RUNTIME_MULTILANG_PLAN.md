# Runtime multi-langage — mesure, options, chiffrage

> Statut : **ÉTAPE 2 — conception. Rien n'est codé. En attente décision A vs B.**
> Étape 1 (mesure) : faite, preuve par trace de l'image. Confirmation `kubectl exec` en cours (autre session).

## 1. État mesuré (rappel)

Chaîne : `values-prod.yaml:126` → `platformEnv.runtime.workspaceAgentImage = .../workspace-agent:sha-7704c1dd6b`
→ `packages/k8s-client/src/index.ts:452 workspacePod()` — **un seul conteneur** `workspace-agent`
→ image construite par `infra/cloudbuild/workspace-agent.yaml` depuis **`services/workspace-agent/Dockerfile`**.

Base : **`node:24-alpine`** (musl). Contenu final : `node`, `npm`/`npx`, `bash`, `git`, `curl`, `tini`.
`python3 make g++` sont installés en `--virtual .build-deps` puis **`apk del`** (Dockerfile L46-50) → absents.
`USER node` + pod `runAsNonRoot: true` → **pas d'`apk add` possible au runtime.**

Absents : `pnpm`, `python3`, `pip3`, `go`, `rustc`, `cargo`, `java`, `javac`, `php`, `ruby`, `dotnet`, `gcc`, `g++`, `make`, `cmake`.

Le verrouillage ne s'arrête pas à l'image — toute la chaîne est mono-langage :

| Couche | Fichier | Verrou |
|---|---|---|
| Détection projet | `services/workspace-agent/src/app.ts` (~L87) | cherche `package.json` uniquement |
| Install | `services/api/src/app.ts:1199` | `packageManager: z.enum(['npm','pnpm','yarn','bun'])` |
| Install argv | `services/api/src/app.ts:6176 buildInstallCommand()` | npm/pnpm/yarn/bun uniquement |
| Build | `app.ts:119 isProductionBuildCommand()` | `npm run build`, `next build`, `react-scripts build`, `nest build` |
| GC / busy | `app.ts:134 isTransientPackageCommand()` | subcommands npm/pnpm/yarn/bun |
| Port / preview | `app.ts:210 VITE_DEV_PIN_ARGS` + commentaire k8s-client | épinglé `--port 5173 --strictPort` (Vite) |
| Éditeur | `app/components/editor/codemirror/languages.ts:89` | `lang-python` = **coloration syntaxique seule** |
| LSP | — | **aucune infrastructure LSP dans le dépôt** |
| Packages panel | `api.projects.$projectId.ide-panel.$panel.ts` | alimenté par `/projects/:id/packages` → npm |

Zéro occurrence de `requirements.txt` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `composer.json` / `Gemfile` / `pom.xml` dans le runtime.

## 2. Trois contraintes structurantes découvertes

**(a) L'agent lui-même est un process Node** (`CMD ["npx","tsx","src/server.ts"]`). Donc **toute** image de workspace, quel que soit le langage du projet, **doit contenir Node**. Cela supprime l'idée d'une « image Python pure » et rend l'option B beaucoup moins coûteuse qu'elle n'en a l'air.

**(b) Alpine/musl est disqualifiant pour Python.** Sans glibc, `pip` ne trouve pas de wheel `manylinux` et retombe sur une compilation depuis les sources — qui échoue de toute façon, faute de compilateur dans l'image finale. `numpy`, `pandas`, `pillow`, `psycopg2`, `cryptography` : tous cassés. Les wheels `musllinux` existent mais la couverture PyPI est très inégale. **→ passage à une base Debian bookworm-slim (glibc) requis.**

**(c) Les pods tournent sous gVisor** (`runtimeClassName: 'gvisor'`, k8s-client L468). gVisor intercepte les syscalls en userspace : une compilation C (donc tout `pip install` qui build depuis les sources) y est **notablement plus lente** qu'en runc. Argument supplémentaire et décisif pour glibc/manylinux : on veut des wheels **précompilées**, pas des builds.

## 3. Migration de base : Alpine → Debian bookworm-slim

Prérequis commun aux deux options.

| | actuel | cible |
|---|---|---|
| Base | `node:24-alpine` | `node:24-bookworm-slim` |
| libc | musl | glibc |
| Taille (non compressée, **estimation à confirmer**) | ~150–180 Mo | ~230–260 Mo |
| Pull compressé (**estimation**) | ~60 Mo | ~90 Mo |

Risque de régression sur les workspaces Node existants : **faible et plutôt favorable**. Même Node 24, mêmes outils (`bash git curl tini` via `apt` au lieu d'`apk`), `node-pty` recompilé au build contre la nouvelle ABI (déjà le cas aujourd'hui). Les paquets npm natifs gagnent des prebuilds glibc au lieu d'échouer sur musl. Point de vigilance : `apk` → `apt-get`, et `busybox` → coreutils (comportement de `sh`/`grep` légèrement différent — l'agent spawn `/bin/bash`, donc non impacté).

**Non négociable : validé sur un projet Node jetable en prod avant tout basculement, image pinnée par SHA, rollback = re-`--set workspaceAgentImage` sur l'ancien tag.**

## 4. Option A — image polyglotte unique

Une image `workspace-agent` contenant Node + Python + Go + Rust + JDK + PHP + Ruby.

Estimation de taille (non compressée, **à confirmer par un build réel**) :

| Couche | Estimation |
|---|---|
| Debian slim + outils | ~90 Mo |
| Node 24 | ~140 Mo |
| Python 3.12 + pip + venv + `python3-dev` + `build-essential` | ~350 Mo |
| Go 1.23 toolchain | ~250 Mo |
| Rust (rustc + cargo + std) | ~800 Mo – 1,2 Go |
| JDK 21 headless | ~330 Mo |
| PHP + Ruby | ~130 Mo |
| **Total** | **~2,1 – 2,5 Go** (pull compressé ~0,8 – 1 Go) |

- **Pour** : zéro plomberie (l'image reste un singleton), et surtout **les projets polyglottes marchent nativement** (backend Python + front Vite dans le même repo — un cas ultra-courant sur Replit). L'image est mise en cache **une fois par nœud** et amortie sur tous les workspaces du nœud.
- **Contre** : chaque utilisateur Node paie ~2 Go pour du Go et du Rust qu'il n'ouvrira jamais. Cold-start sur nœud froid (scale-up du pool sandbox) : pull de ~1 Go depuis Artifact Registry même région → **estimation 30–90 s** avant le premier pod. Aujourd'hui c'est ~5–10 s.
- **Atténuation à évaluer** : **GKE Image Streaming** (le pod démarre avant la fin du pull, les couches sont lues à la demande). Ça neutraliserait presque entièrement l'objection cold-start. ⚠️ **À vérifier : compatibilité Image Streaming × GKE Sandbox/gVisor** — je ne l'affirme pas.

## 5. Option B — images par stack

Une image par stack, choisie à la création du projet. **Chaque image contient Node** (contrainte (a) : l'agent est un process Node).

| Image | Contenu | Taille estimée |
|---|---|---|
| `workspace-node` | Debian slim + Node (image actuelle migrée) | ~250 Mo |
| `workspace-python` | + Python 3.12, pip, venv, `python3-dev`, `build-essential`, libs système curées (`libpq`, `libjpeg`, `zlib`, `libffi`) | ~600 Mo |
| `workspace-go` | + Go toolchain | ~500 Mo |
| `workspace-rust` | + rustup/cargo | ~1,1 Go |
| … | | |

- **Pour** : le workspace Node existant **ne grossit quasiment pas** (~250 Mo) → aucune régression de cold-start pour 100 % du trafic actuel. Chaque image peut embarquer **son serveur LSP** (pyright pour Python, gopls pour Go) sans polluer les autres. Le warm-pool peut être dimensionné par langage selon l'usage réel.
- **Contre** : plomberie à construire — champ `language` sur le projet (⚠️ **touche la DB : coordination avec la session DB**), mapping template→image, résolution de l'image côté API, map `lang→image` dans les values Helm, un pipeline Cloud Build par image. **Et : un projet polyglotte (Python + front Vite) est mal servi** — sauf à faire de `workspace-python` une image *Node + Python*, ce qu'elle est déjà par construction.
- **Bonne nouvelle sur le coût de plomberie** : `workspacePod()` prend **déjà** `input.image` en paramètre (`k8s-client/src/index.ts:487`). Le pod spec n'a pas à changer. Il faut seulement décider **qui calcule cette string**.
- Coût de stockage registry : négligeable (~$0,10/Go/mois → quelques euros).

## 6. Ce que fait Replit

Replit est **Nix**-based : une image de base légère, et le `replit.nix` du projet déclare ses toolchains, que Nix matérialise depuis un store partagé et monté par-dessus. C'est conceptuellement **A composé paresseusement** : une seule image, mais on ne paie que les toolchains déclarés. Reproduire ça chez nous = introduire Nix + un store partagé (PVC/CSI) + une couche de composition — **hors de portée à court terme**, et incompatible en l'état avec `runAsNonRoot` + gVisor sans travail d'infra significatif. À garder comme cible long terme, pas comme premier jalon.

## 7. Recommandation

**Option B**, pour trois raisons :

1. **Le risque prod est asymétrique.** 100 % de nos workspaces sont Node aujourd'hui. L'option A leur impose un cold-start dégradé et une image ×10 pour un bénéfice nul. L'option B les laisse à ~250 Mo.
2. **La plomberie est déjà à moitié là** — `workspacePod()` prend `image` en paramètre. Le vrai coût n'est pas le pod spec, c'est le champ `language` + le mapping, soit ~3-4 j.
3. **Le LSP impose la séparation de toute façon.** Un serveur LSP par langage (pyright ~50 Mo, gopls, rust-analyzer ~200 Mo) doit vivre dans le pod. Les empiler tous dans une image unique aggrave l'objection taille de A.

L'objection « projets polyglottes » tombe puisque **chaque image contient Node** : `workspace-python` = Node + Python, donc un backend Flask avec un front Vite marche dans la même image.

## 8. Chiffrage — « Python seul, bien fait »

Ordre de valeur retenu : **Python d'abord**, puis statique, puis Go.

| Lot | Contenu | Estimation |
|---|---|---|
| 1. Migration base Node | `alpine` → `bookworm-slim`, non-régression Node en prod sur projet jetable | **2 j** |
| 2. Image `workspace-python` | Node + Python 3.12 + pip + venv + build-essential + libs curées ; `pip install numpy/pandas/psycopg2` **prouvé dans le pod** | **2-3 j** |
| 3. Plomberie image-par-stack | champ `language` (⚠️ DB — autre session), mapping template→image, résolution API, map Helm, pipeline Cloud Build | **3-4 j** |
| 4. Détection de langage | marqueurs `requirements.txt` / `pyproject.toml` / `*.py` dans `workspace-agent` + API | **2 j** |
| 5. Cycle install/run/build | `buildInstallCommand` (pip/uv), `isTransientPackageCommand`, `isProductionBuildCommand`, enum `packageManager` étendu | **3 j** |
| 6. Port & preview | aujourd'hui épinglé Vite 5173 ; il faut une détection de port réelle (sonde des sockets en écoute dans le pod) ou convention `PORT` + bind `0.0.0.0` ; le preview-proxy doit suivre | **2-3 j** |
| 7. Packages panel pip | endpoint recherche PyPI, parse `requirements.txt`/`pyproject.toml`, install/uninstall | **2-3 j** |
| **Sous-total « Python qui tourne, preview qui rend »** | | **≈ 16-20 j ouvrés** |
| 8. LSP Python | **greenfield — aucune infra LSP n'existe** : pyright dans le pod, bridge WebSocket via l'agent, client LSP CodeMirror | **5-8 j** |
| **Total Python complet (avec autocomplétion)** | | **≈ 21-28 j ouvrés** |
| 9. Déploiement d'une app Python | **non fait ici** — rapport transmis à la session deploy | rapport |

**Jalon proposé** : livrer les lots 1→7 (≈ 3-4 semaines) = *un projet Python créé, `pip install` qui marche, serveur qui démarre, preview qui rend dans le navigateur*, prouvé en prod. Le LSP (lot 8) est un second jalon — c'est le plus gros inconnu du chantier et il ne doit pas bloquer la mise en ligne de Python.

## 9. Points ouverts (décision requise)

1. **A ou B** — recommandation : B.
2. **Champ `language` en DB** — coordination avec la session DB.
3. **Image Streaming × gVisor** — à vérifier ; conditionne la viabilité de A si A est choisi.
4. **Liste des libs système curées** dans l'image Python — l'utilisateur ne peut pas `apt install` (non-root). À figer une bonne fois (`libpq`, `libjpeg`, `zlib`, `libffi`, `ffmpeg` ?).
5. **`pip` vs `uv`** — `uv` est ~10× plus rapide, ce qui compte double sous gVisor.
