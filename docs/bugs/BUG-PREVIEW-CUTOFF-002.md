---
id: BUG-PREVIEW-CUTOFF-002
---

## Bug

**P2 — la carte de préparation de l'aperçu est tronquée EN HAUT sur téléphone** (Avi, captures de la semaine du 21/09). Le haut de la carte — son chrome et le début de son contenu — est coupé, et rien ne permet d'y accéder.

## 📤 Dispatché

☑ 28/09

## 💻 Codé

☑ 28/09 — `.bolt-preview-splash-shell` borne sa hauteur et rend l'excédent défilable, comme `.bolt-preview-loading-card` le fait déjà.

## ✅ Testé live

☐ — DÉPLOYÉ en `7f573aaf0` (règle `max-height: 100%` + `overflow-y: auto` présente dans la CSS servie), mais **PAS vérifié à l'écran** : le 28/09, l'état qui affiche la carte n'a pas pu être reproduit en prod — 5 passes (démarrages à froid, arrêt de l'exécution, génération qui modifie `package.json`, sonde toutes les 150 ms pendant 5 min) sans une seule apparition de `.bolt-preview-splash-shell`. D'après `shouldShowStartupOverlay`, la carte n'apparaît que si l'espace est prêt, sans aperçu actif, sans démarrage ni statut en cours. Reste OUVERT tant qu'une capture n'a pas été prise.

## Preuve

**Mesuré le 2026-09-28 à 390 px**, sur la prod servie en `d4a6f1df28`, pendant un
démarrage réel :

```
83s  .bolt-preview-splash        t=111 b=763 h=652   scrollH=715  clientH=652  overflow-y=hidden
                                 justify=center  align=center
     .bolt-preview-splash-shell  t=56  b=818 h=762
     .bolt-preview-splash-chrome t=57  b=95
     parent .bolt-project-webview-viewport  t=110 b=764 h=654
                                 overflow-y=auto  scrollTop=0  scrollH=652  clientH=652
```

**Trois faits qui se lisent ensemble.** Le contenu fait 715 px pour une boîte de
652 : 63 px de trop. Le parent centre verticalement, donc ces 63 px se
répartissent **de part et d'autre** — la coque s'étend de y=56 à y=818 dans une
fenêtre qui s'arrête à 764, soit 55 px perdus EN HAUT, chrome de la carte
compris. Et le `overflow-y: auto` du parent est **inerte** : son `scrollHeight`
vaut exactement son `clientHeight` (652), parce qu'un enfant clampé en `hidden`
ne propage aucun débordement à faire défiler. C'est le piège classique du
centrage en flex : le débordement du côté du bord de départ est inatteignable,
même avec un ascenseur.

**Troisième occurrence du mécanisme de `BUG-PREVIEW-CUTOFF-001`**, et le remède
était déjà dans le fichier : `.bolt-preview-loading-card` porte
`max-height: 100%` + `overflow-y: auto` + `overscroll-behavior: contain`, avec le
commentaire qui dit que l'override mobile l'avait avant la règle de base. Personne
ne l'avait reportée sur la coque du splash. Appliqué à l'identique ; l'axe X reste
masqué, c'est lui qui tient les coins arrondis.

**Épinglé par `app/styles/deux-defauts-visuels.spec.ts`** (§2, quatre cas dont un
qui vérifie que le voisin `.bolt-preview-loading-card` garde le même remède, pour
que les deux ne rediverge pas). Contre-épreuve dans les deux sens, ligne de
verdict lue à chaque fois : correctif retiré → **2 rouges / 7 verts** ; centrage
du parent retiré, c'est-à-dire ce que le correctif protège → **1 rouge / 8
verts** ; tout remis → **9 verts**.
