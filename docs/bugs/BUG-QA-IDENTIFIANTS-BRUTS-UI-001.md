---
id: BUG-QA-IDENTIFIANTS-BRUTS-UI-001
---

## Bug

**P1 finition — l'identifiant technique d'un utilisateur (cuid de 25 caractères) est affiché À LA PLACE de son nom, à 7 endroits de l'interface.** C'est le défaut signalé par Avi sur « Membres actifs », et il n'est pas isolé : le même motif se répète dans tout le produit. **Le cas signalé** — `app/components/project-ide/ProjectOverviewPanel.tsx:316`, bloc « Membres actifs » du panneau Vue d'ensemble : `{member.userId \

## 📤

\

## 💻

copy['projectOverview.member.unknown']}` rendu dans un `<strong>` en texte **primaire**. L'utilisateur lit `cmta9cm7h003t0n8zy8heiw1v` là où il attend un nom. La classe `break-all` appliquée sur ce `<strong>` montre d'ailleurs que l'auteur savait qu'une longue chaîne insécable y atterrirait. **Les 6 autres occurrences** (toutes sur `origin/main`) : `app/components/chat/BaseChat.tsx:13729` — `<strong>{user.userId}</strong>`, **nom principal** d'une personne dans le bloc Présence du panneau Collaborateurs ; **`:13727`** — l'avatar vaut `String(user.userId ?? 'U').slice(0, 2)`, or **tous les cuid commencent par `c`** : chaque avatar affiche donc **« cm »**, et tous les participants deviennent visuellement identiques ; `:13755` — `<span>{collaborator.userId}</span>`, identité de la ligne collaborateur ; `:13842` — `<small>{comment.userId}</small>`, auteur d'un commentaire ; `:14533` — `` {event.actorUserId ? ` · ${event.actorUserId}` : …} ``, acteur d'un événement dans le flux d'activité ; `app/routes/admin.$section.tsx:5589` — `{request.userId}` dans les demandes de suppression de compte (surface d'administration). **Le bon patron existe déjà dans le code** : `app/routes/usage.tsx:172-173` définit `memberLabel = (member, index) => member.name?.trim() \

## ✅

\

## Preuve

member.email?.trim() \

