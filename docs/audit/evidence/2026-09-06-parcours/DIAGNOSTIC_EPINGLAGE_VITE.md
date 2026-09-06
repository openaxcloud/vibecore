# L'agent écrase la configuration de plateforme, et la protection ne se déclenche pas

## Le fait

Deux projets du même échafaudage, sur l'environnement d'audit :

| | `vite.config.ts` |
|---|---:|
| projet **sans génération** | **1 852 o** |
| après **une** génération | **167 o** |

Ce qui disparaît est exactement ce dont l'aperçu dépend :

```js
const __ecodeHmrOverride = {
  server: { host: true, port: 5173, strictPort: true,
    hmr: { clientPort: …, protocol: 'wss', host: … } } };
export default __ecodeMergeConfig(__ecodeUserConfig, __ecodeHmrOverride);
```

Le commentaire du fichier d'origine dit pourquoi : *« sinon il construit
`wss://localhost:undefined` et le HMR meurt »*.

Ce que l'agent laisse :

```js
export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0' } });
```

Raisonnable dans l'absolu, faux ici : sans `port: 5173` ni `strictPort`, Vite
prend le premier port libre, et le proxy d'aperçu vise **5173 en dur**. Le
serveur peut tourner et rester injoignable.

## L'échelle, mesurée en production par la session `vibecore-d5`

| | |
|---|---:|
| projets avec un `vite.config.ts` | 289 |
| épinglage **intact** | 96 |
| **épinglage perdu** | **193 — 67 %** |
| configs réécrites courtes (< 400 o) | 194 |

Témoin de sa mesure : la même requête voit des configs à 1 852 o — la valeur de
référence — et une à 11 791 o. Elle sait donc lire.

C'est le **mode de défaillance dominant de l'aperçu** sur cette plateforme.

## La protection existe déjà, et elle est bien conçue

`ensureViteHmrConfig` (`app/lib/runtime/vite-hmr-config.ts`) est **idempotente** :
marqueur `__ecodeHmrOverride` + marqueur d'épinglage `port: 5173`, et elle
fusionne au lieu d'écraser. Son appelant `supplementalPreviewFiles`
(`preview-manifest.ts:351`) porte ce commentaire :

> *« The model wrote its OWN vite.config, so the scaffold above is skipped and
> its HMR isn't wired for the proxy (→ wss://localhost:undefined, blank app).
> Post-process it to guarantee server.host + server.hmr — without discarding the
> model's settings. »*

Quelqu'un a anticipé ce défaut et écrit le remède. **Le remède ne s'exécute pas.**

## Où elle est accrochée

```
ensureViteHmrConfig()
  ← supplementalPreviewFiles()          preview-manifest.ts:351
    ← buildPreviewManifestRepair()
      ← #syncPreviewManifestFromRuntimeOnce()   workbench.ts:3733  (ÉCRIT les fichiers)
        ← #syncPreviewManifestFromRuntime()
           ├── workbench.ts:955   startPreviewServer()
           └── workbench.ts:3580  #refreshPreviewAfterArtifactClose()
                 ← updateArtifact(), si `state.closed && !wasClosed`   workbench.ts:2960
```

**Le premier déclencheur est le démarrage de l'aperçu** — c'est-à-dire la chose
même que la perte de l'épinglage empêche. Les deux défauts se tiennent l'un
l'autre.

## Ce qui N'EST PAS établi

La chaîne est complète sur le papier et le second déclencheur écrit bien les
fichiers. Pourtant le projet mesuré est resté à 167 o.

**Je n'ai pas établi pourquoi.** Deux candidats non départagés :

1. l'artefact ne passe jamais à `closed`, donc `updateArtifact` ne déclenche rien ;
2. la réparation s'exécute et calcule un no-op.

**Ce sont deux correctifs opposés.** Le premier demande un chemin qui ne dépende
pas de la fermeture d'artefact ; le second demande de corriger la détection.

### Conséquence pour la remédiation des 193 projets

Si la cause est (1), décrocher la réparation du démarrage **ne suffira pas** :
les projets existants ne se répareraient pas d'eux-mêmes à la prochaine
ouverture, et une remédiation en base deviendrait nécessaire.

## Ce qui reste à faire, et pourquoi ce n'est pas fait

Le correctif exige une **contre-épreuve réelle** — une génération sur un projet
neuf vérifiant que l'épinglage survit. Un test unitaire ne prouverait rien : la
chaîne est déjà correcte unitairement, c'est son déclenchement qui manque.

Cette mesure est **bloquée** : l'étage API de l'environnement d'audit est
dégradé (0 réplique prête sur 3, un pod `Pending`, un `Failed`, deux `Running`
non prêts, âges étalés sur trois heures, zéro redémarrage — donc pas un
déploiement en cours). Dernière tentative interrompue : projet créé, config à
1 153 o avant, 26 artefacts produits, API tombée avant la relecture.

**Aucun correctif n'est livré sur ce point.** Un correctif annoncé sans sa
preuve rouvrira dans six mois sans que personne sache pourquoi.
