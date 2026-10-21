---
id: BUG-API-ENTERPRISE-SETTINGS-RACE-001
---

# Deux lectures initiales des paramètres entreprise peuvent produire HTTP 500

## 📤 Dispatché

Revue UX #753, transmis pour prise en charge par le chantier API. Backend local main `4af4dd1a0ba14473affb2ee7fdeabbac23b1274f`, PostgreSQL dédié, aucune preuve production.

## 💻 Codé

Non corrigé dans le lot UX. Ne pas changer les règles de sécurité pour supprimer cette erreur : elle se produit dans la lecture des paramètres du préhandler, avant le contrôle IP.

## ✅ Testé live

Reproduit lors d’un chargement réel de `/projects/:id/snapshots?lang=fr`, avec un seul worker navigateur. Les fixtures créent les utilisateurs/organisations/projets par appels await séquentiels ; elles n’appellent pas getEnterpriseSettings. Les deux projets concernés sont créés à 08:09:52 UTC, plus de onze minutes avant l’erreur. Ce n’est pas une collision d’écriture pendant leur préparation.

Le loader `app/routes/projects.$projectId.snapshots.tsx` lance GET projet et GET instantanés en parallèle (Promise.all). Les deux passent dans le préhandler `services/api/src/app.ts:12067`, qui appelle `PrismaApiStore.getEnterpriseSettings`, `prisma-store.ts:4177`. L’upsert initial avec update vide produit une contrainte unique sur organizationId lorsqu’une autre lecture crée simultanément la ligne.

Cas tablette FR :

- GET `/projects/cmvhu0ce9000iwrr0refz0ryj` à 08:21:02.048, request ID `89e803d5-5eef-4a73-91c8-c1c41c97e2f9` → 500 en 119ms.
- GET `/projects/cmvhu0ce9000iwrr0refz0ryj/snapshots` à 08:21:02.053, request ID `329a0668-8623-426e-870b-29c4ef5c2486` → 200 en 150ms.
- Ligne EnterpriseOrganizationSettings créée/mise à jour à 08:21:02.125 ; projet créé à 08:09:52.065.

Cas mobile FR : GET projet `769140ed-defc-4615-9e8b-f27748a61688` → 500 ; GET instantanés `51aa82ef-8540-4c4b-afc4-19305ca35c5c` → 200, départs séparés de 4ms. La page affiche son error boundary et n’expose pas le formulaire. Les lectures ultérieures répondent 200, sans mutation des fixtures, puis les recettes passent. Cela ne constitue pas une correction du défaut initial.

Preuves : [requêtes jumelées](ux-confirmation-2026-10-21/review/enterprise-settings-paired-requests.json), [erreurs avec piles complètes](ux-confirmation-2026-10-21/review/enterprise-settings-race.json), [horodatages PostgreSQL](ux-confirmation-2026-10-21/review/enterprise-settings-fixture-times.txt), [préparation exacte](ux-confirmation-2026-10-21/review/snapshot-final-fixtures.ts.txt), [échecs navigateur](ux-confirmation-2026-10-21/review/formats-first.txt).

Reproduction à compléter côté API avec une organisation synthétique neuve, sans paramètres précréés, puis deux GET autorisés concurrents vers projet/instantanés. Ne pas supprimer de paramètres existants pour reproduire. Aucun fournisseur, mock ou changement du quota n’intervient. Pas de fuite de pool démontrée ; cette erreur est distincte des timeouts de connexion PostgreSQL.
