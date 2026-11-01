---
id: BUG-STAGED-UPGRADE-PREFLIGHT-DEFAULTS-20261101
section: "Déploiement et sécurité"
---

# Précontrôle identique à la mise à niveau Helm

## 📤 Dispatché

☑ 01/11 — diagnostiquer le refus `STAGED_MANAGER_UNRELATED_RESOURCE_CHANGED`
du run41319278233, tentative3, SHA1ddbc51e, révision initiale1341.

## 💻 Codé

☐ — correctif isolé préparé ; livraison encore requise.

## ✅ Testé live

☐ — aucun nouveau rollout ni lecture du registre Prisma démontré.

## Défaut établi et limite de causalité

Le précontrôle utilisait `helm template` et les valeurs utilisateur seules.
L'upgrade réel utilise `--reuse-values`, donc les defaults coalescés du chart
de la release précédente. Ces opérations ne sont pas équivalentes.
Source primaire : Helm3.16.2 `pkg/action/upgrade.go`, fonction reuseValues.
https://github.com/helm/helm/blob/v3.16.2/pkg/action/upgrade.go#L518-L532

La ressource précise divergente de la révision1341 reste inconnue : l'ancien
message ne l'indiquait pas. Le défaut de précontrôle est prouvé, mais ne doit
pas être présenté comme identification rétrospective de cette ressource.
La lenteur préalable de helm history et son GOAWAY sont un incident distinct.

## Correction

Un même tableau d'arguments définit l'upgrade réel et son dry-run serveur JSON.
Le précontrôle ajoute seulement les options dry-run et sortie JSON. Manifest et
hooks de la réponse sont tous comparés aux ressources stockées. Toutes les
gardes existantes restent actives avant la première mutation.

Les refus de divergence donnent identité de ressource et chemins bornés, jamais
valeurs ; clés des données Secret, annotations et labels sont masquées. Une
troncature du diagnostic ne permet jamais le déploiement. Aucune nouvelle
permission, clé, ressource payante ou exception de sécurité n'est ajoutée.

## Preuves

Treize tests locaux : séquence, absence de mutation avant garde, mêmes arguments,
JSON/hooks malformés refusés, confidentialité et bornes du diagnostic, migration
et imageIDs, exécution hermétique du bundle sans dépendances installées.
Bundle régénéré et reproductibilité vérifiée. Un quatrième scénario Helm réel
obligatoire en CI illustre la divergence de valeur conservée ; cette fixture
n'est pas un upgrade contre le cluster de production. Helm local indisponible,
aucun téléchargement anciennement refusé n'a été retenté.
