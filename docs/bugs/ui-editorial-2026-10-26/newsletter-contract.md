# Newsletter — succès non vérifié et contrat manquant

## Défaut reproduit, sans mutation

Dans quatre groupes FR/EN×thèmes, ouvrir `/newsletter/confirm` sans token puis cliquer son action mène à `/newsletter-confirmed`. Le texte annonce « Votre abonnement à la newsletter E-Code est confirmé » ; aucune donnée d’abonnement ni réponse de mutation n’a été obtenue. `newsletterPageChrome` envoie également l’action unsubscribe vers cette même page de confirmation d’abonnement. Ce n’est donc pas simplement une démo identifiée : les textes affirment un résultat personnel effectif. Les reçus `interactions.json` et capture `newsletter-confirmed-no-token.png` documentent le chemin ; pas de token réel, email envoyé ou changement d’abonné.

## Source et frontière de contrat

- `app/routes/newsletter_.confirm.tsx:4` commente un token « acknowledged client-side », mais ne contient ni loader/action ni lecture du token ; le rendu est seulement MarketingStaticPage.
- `app/routes/newsletter_.unsubscribe.tsx:4` évoque aussi un token mais rend uniquement une définition statique ; aucune vérification ni écriture.
- `app/routes/newsletter-confirmed.tsx:6` affiche le succès sans précondition.
- `app/components/marketing/EcodeMarketingPages.tsx:359` définit les destinations confirm/unsubscribe vers `/newsletter-confirmed`. Ce renderer est partagé avec d’autres lots, donc pas modifié ici.
- `app/routes/newsletter.tsx:13` possède une vraie action d’inscription, utilisée par le footer et Statut, qui valide l’email, relaie l’API et rapporte son résultat. Elle n’est pas un contrat de confirmation ou de désinscription.
- `services/api/src/app.ts:10918` expose uniquement POST `/newsletter/subscribe`, validation email/source et rate limit. Réponse202 `{ok:true,alreadySubscribed}` après le store. Aucun endpoint newsletter confirm/unsubscribe trouvé dans les routes API et frontend consultées.
- `services/api/src/prisma-store.ts:1051` normalise l’email puis upsert ; create inscrit l’adresse, update remet unsubscribedAt ànull. Aucun confirmedAt ni envoi email dans cette méthode ou ce handler.
- `services/api/src/store.ts:1428` n’expose que subscribeNewsletter. `packages/database/prisma/schema.prisma:1955` possède confirmedAt/unsubscribedAt, mais aucun token de confirmation/désinscription, hash, expiration ou consommation associé à NewsletterSubscriber.
- Un transport email existant est disponible dans `services/api/src/email.ts` via EmailProvider.send ; d’autres parcours API l’utilisent. Il n’est pas raccordé au handler newsletter. Aucune configuration réelle ou disponibilité de livraison n’a été testée ici.

## Proposition de lot backend séparé à coordonner

Il est impossible de confirmer ou désinscrire de façon sûre en branchant ces pages sur le seul endpoint subscribe : celui-ci réactive au contraire les adresses désinscrites. Ne pas fabriquer une réponse de succès côté client, ne pas retirer les fonctions pour masquer ce manque.

Proposition concrète à valider avec le propriétaire backend : définir un cycle de consentement et des jetons opaques limités à leur finalité, stockés sous forme de hash, avec expiration/consommation pour confirmation et politique explicite de révocation pour désinscription. Ajouter les opérations de store et endpoints confirm/unsubscribe idempotents, validation de jeton et erreurs stables (manquant/invalide/expiré/déjà traité/indisponibilité). GET doit afficher un état et une action explicite, pas muter un abonnement sur ouverture d’un lien par un scanner email. Réutiliser le transport email configuré et les mécanismes de génération de jetons existants, sans nouveau fournisseur, secret ou accès persistant aux comptes.

La décision de passage de l’inscription actuelle à un double consentement et le traitement des abonnés existants nécessitent un contrat produit/backend explicite ; ne pas migrer ou confirmer les données réelles pour les tests. Prévoir des tests de store/transactions et fixtures synthétiques pour tokens invalides/expirés, rejeu, courses, erreurs email et erreurs API, sans expédier d’email réel. Les routes frontend pourront ensuite afficher succès uniquement après résultat vérifié, conserver erreurs/récupération et textes FR/EN. La page de résultat doit dépendre d’une preuve vérifiée de l’opération, pas d’un GET public arbitraire.

Blocage exact actuel : endpoints, stockage/validation des jetons et parcours de livraison newsletter absents. Ce diagnostic ne modifie ni backend, schéma, mailer, données, secrets ni frontend Newsletter. Aucune promesse d’achèvement de ces fonctions.
