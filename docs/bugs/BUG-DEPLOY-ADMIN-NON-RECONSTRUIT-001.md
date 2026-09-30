---
id: BUG-DEPLOY-ADMIN-NON-RECONSTRUIT-001
---

## Bug

**P2 — l'image `admin` n'est pas reconstruite comme les sept autres services, et reste en arrière à chaque déploiement.**

Mesuré le 2026-09-30 : `admin` servait `d4a6f1df28` pendant que les sept autres services servaient `a9e99cbdc1`. Ce n'est pas un retard ponctuel — `admin` traîne depuis plusieurs jours.

## 📤 Dispatché

☑ 2026-09-30 — consigné par la session livraisons.

## 💻 Codé

☐

## ✅ Testé live

☐

## Preuve

**Relevé Helm du 2026-09-30, sept services alignés et un seul en retard :**

```
admin=d4a6f1df28
aiGateway=a9e99cbdc1   api=a9e99cbdc1        previewProxy=a9e99cbdc1
screenshotter=a9e99cbdc1  web=a9e99cbdc1     worker=a9e99cbdc1
workspaceManager=a9e99cbdc1
```

**Le signal trouvé dans les journaux d'intégration**, le même jour :

```
##[error]echec du tag running-admin pour europe-west9-docker.pkg.dev/vibe…
```

Le tag `running-admin`, qui suit l'image effectivement servie, échoue — ce qui est cohérent avec une image jamais reconstruite : on ne peut pas étiqueter ce qui n'existe pas pour ce SHA.

**Ce qu'il faut établir avant de corriger.** Le déploiement construit via **trois** configurations Cloud Build régionales — `runtime-tier.yaml`, `single-web.yaml`, `workspace-agent.yaml`. La question à trancher d'abord : `admin` figure-t-il dans l'une d'elles ? S'il n'y figure pas, ce n'est pas un échec de build mais une **absence** de build, et le correctif n'est pas au même endroit.

⚠️ **Pourquoi ça compte au-delà de l'esthétique.** Un service sur huit qui sert un code plus ancien que les autres, c'est une incohérence qui se paye plus tard en comportement incompréhensible : la console d'administration peut appeler une API qui a changé de contrat sans que rien ne le signale. Une entrée du registre lue par `admin` mais écrite par l'`api` d'une autre version est exactement ce genre de piège.
