# BUG-NEWSLETTER-UNVERIFIED-SUCCESS-20261026

📤 Dispatché ☑ · 💻 Codé/main ☐ · ✅ Testé live production ☐

Sans token ni mutation, `/newsletter/confirm` mène à `/newsletter-confirmed` qui affirme un abonnement confirmé. Le lien unsubscribe mène aussi à ce succès d’abonnement. Reproduction locale4groupes FR/EN×thèmes, aucun email réel envoyé.

[Cause et contrat manquant](ui-editorial-2026-10-26/newsletter-contract.md). Seul POST `/newsletter/subscribe` existe ; aucun endpoint/token/store pour confirmer ou désinscrire. Le transport email existant n’est pas raccordé à la newsletter. Aucun correctif cosmétique ni nouveau service créé ; lot backend distinct à coordonner, fixtures synthétiques uniquement. Aucun succès fonctionnel ou production revendiqué.
