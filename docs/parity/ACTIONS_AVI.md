# ACTIONS AVI — ce qui n'attend que toi

schemaVersion: 1
repoCommit: 9eab2990

Liste consolidée (audit de couverture du 19/07 : ces actions étaient éparpillées
dans 6 fichiers différents). Une ligne = une action concrète. Quand c'est fait,
dis-le à une session : elle coche, lance la suite et met la preuve.

| # | Action | Ce que ça débloque | Trace |
|---|---|---|---|
| 1 | **Stripe** : dans le dashboard Stripe, créer les produits/prix des plans (ou lancer `pnpm stripe:seed` avec une clé valide) et **remplacer la clé expirée** | Tout le billing réel : drill de paiement, factures, go-live des crédits | `PR-STRIPE-01`, `UNK-BILLING-LEGACY-GOLIVE` |
| 2 | **GO pour recréer le pool de serveurs** avec des disques standard (les workspaces redémarrent pendant l'opération, ~1 fenêtre calme) | Débloque l'autoscale (quota disque plein : 432/500) | `PR-MISC-05` |
| 3 | **Décider quoi faire de l'ancien système de crédits** : on l'allume (bascule + backfill), ou on le remplace par le nouveau ledger ? | Toute la mise en route de la facturation | `DEC-BILLING-LEGACY-VS-LEDGER` |
| 4 | **Faire relire les 5 pages légales par un juriste** (conditions, confidentialité, DPA, SLA, DMCA/strikes) | Lancement payant sans risque juridique | `PR-LEGAL-01` |
| 5 | **Confirmer les boîtes mail réelles** `appeals@e-code.ai` + le canal DMCA | Les pages légales pointent vers de vraies adresses | `PR-LEGAL-01` |
| 6 | **Fixer les délais de support** que tu t'engages à tenir par plan (les pages affichent des chiffres provisoires) | Pages Support/SLA honnêtes | `PR-MISC-03` (E18/E27) |
| 7 | **Te connecter une fois en admin prod** pour qu'on certifie les écrans admin + l'impersonation de bout en bout | Certification admin | `PR-SEC-04` |
| 8 | **Décider le thème de la parité pixel** : thème clair Replit littéral, ou notre mapping sombre+orange ? | Les mesures pixel déjà prises peuvent être appliquées | `P1-COV-07` |
| 9 | **Valider (ou corriger) le gabarit SOL-01 App Builder** | Débloque les 8 autres pages Solutions (SOL-02 à SOL-09) | `DESIGN_PROGRAM_MASTER` SOL-01 |
| 10 | **Envoyer la capture de référence Replit du panneau Files** (densité) | Finition pixel du panneau Files | `P1-COV-07` |
| 11 | **Renseigner les accès entreprise** (OIDC/SAML) et les OAuth apps des providers (GitHub/GitLab/Netlify/Vercel/Supabase) via `/admin/oauth-providers` — quand tu veux activer ces intégrations | Connexions entreprise + connecteurs live | `PR-CFG-01`, `BD-21` |

Le fix sécurité tokenHash des invitations est déjà traité par une session dédiée
(PR #6) — il attend seulement ton feu vert de merge.
