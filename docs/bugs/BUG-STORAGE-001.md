---
id: BUG-STORAGE-001
---

## Bug

**P2 — le panneau « Stockage d'objets » annonce une cause FAUSSE : « n'a pas été activé par un administrateur », alors que la fonctionnalité EST activée et que c'est la route amont qui ne répond pas.** Message affiché : « Le stockage d'objets n'est pas encore disponible — Le stockage d'objets cloud n'a pas été activé pour la plateforme de cet espace de travail. Une fois qu'un administrateur l'aura activé… ». Or `OBJECT_STORAGE_ENABLED` vaut bien **`true`**, y compris **dans l'environnement du process API** (`printenv` dans le pod), et l'API ne gate que sur ce drapeau (`services/api/src/object-storage.ts:18`). En réel, `GET /projects/:id/object-storage/status` et `…/objects` **ne répondent pas du tout** (timeout à 20 s, 0 octet reçu), tandis que `/projects/:id/dashboard` répond instantanément sur le même hôte et le même jeton. La cause du blocage n'est **pas** l'egress : depuis le pod API, `storage.googleapis.com` répond en **84 ms**. Défaut produit indépendant de cette cause : le proxy de panneau (`app/routes/api.projects.$projectId.ide-panel.$panel.ts:1303-1315`) traduit en `{enabled:false}` **tout 404 dont le corps n'a pas de champ `code`** (`payload.code === 'FEATURE_NOT_ENABLED' \

## 📤 Dispatché

\

## 💻 Codé

payload.code === undefined`) — un fourre-tout qui **masque les vraies pannes amont** derrière un message « demandez à votre administrateur ». L'utilisateur est envoyé sur une fausse piste.

## ✅ Testé live

☑ 09/09

## Preuve

☑ 09/09 (moitié PRODUIT)

