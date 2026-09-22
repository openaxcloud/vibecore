---
id: BUG-REL-002
---

## Bug

**P1 — la protection des images en service est MORTE depuis au moins le 29/08 : 4 des 5 images qui tournent en production ne portent aucun tag `running-*`.** Le job `AR Protect Running Images` tourne toutes les 6 h et echoue a chaque fois.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **OUVERT — mesure en prod 01/09**

## Preuve

**Mesure** : 12 executions consecutives en `failure`, la plus ancienne remontant au 2026-08-29. **Cause** : la reference d'image en service est un **digest** (`admin@sha256:...`) et le decoupage `pkg="${pkg%%:*}"` ne retire pas le `@sha256`, d'ou `ERROR: (gcloud.artifacts.docker.tags.add) Image .../admin does not match image .../admin@sha256`. `admin` etant **premier dans l'ordre alphabetique** et GitHub executant les steps en `bash -e`, **la boucle meurt sur la premiere image et aucune des suivantes n'est jamais taguee**. **Constat sur le registre** : `api`, `web`, `worker`, `ai-gateway` = `[<sha>, latest]`, **aucun `running-*`** ; seul `admin` en porte un, reliquat d'avant la regression. **Risque** : la politique du depot `vibecore-prod-containers` supprime tout ce qui a plus de 7 jours et n'est ni dans les 20 versions les plus recentes ni tague `running-*`/`helm-active-*`. Latent aujourd'hui (les 4 images datent d'hier ou d'aujourd'hui), reel des qu'un service n'est pas reconstruit pendant 7 jours.

