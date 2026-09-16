---
id: BUG-CI-003
---

## Bug

**P2 — les builds bureau tournaient jusqu'au bout sur des commits deja depasses.** File CI engorgee, deploiements en attente derriere du travail inutile.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **CORRIGE, en attente de livraison**

## Preuve

`electron.yml` n'avait AUCUN bloc `concurrency` — 14 workflows sur 26 n'en ont pas, mais celui-ci est le plus lourd : chaque execution lance TROIS builds (macOS/Windows/Linux) de 21 a 40 min. **Mesure du 01/09** sur les 30 dernieres executions : **395 minutes de runner sur des commits depasses**, dont **261 pour la seule branche `audit/registre-expert`** (11 executions) — soit, a trois builds par execution, une vingtaine d'heures de runner. **Correctif** : idiome deja employe par `ci.yml`, annulation limitee aux `pull_request` — jamais un tag, car une execution annulee n'est pas une execution verte. **Aucune porte n'exige ce workflow** (ni `required-checks.json`, ni les 3 controles requis de la protection de `main`), donc l'annuler ne peut bloquer aucune livraison. **Verifie au passage** : les 6 workflows se declenchant sur « toutes branches » le font tous sur `pull_request`, ce qui est voulu ; aucun ne part sur un push de branche quelconque — le correctif anterieur tient.

