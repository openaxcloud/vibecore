---
id: BUG-AI-PROVIDER-CREDITS-20261028
---

# BUG-AI-PROVIDER-CREDITS-20261028 — Crédits fournisseur présentés comme erreur transitoire

📤 Dispatché : ☑ 28 octobre 2026, recette génération Lite.
💻 Codé : ☐ Correctif local en validation, non publié.
✅ Testé live : ☐ Échec réel constaté ; correctif non déployé, aucune nouvelle génération.

## Preuve

Le 28 octobre à 10:54:53.548 UTC, le navigateur a reçu de `/api/chat` le diagnostic « Your prepayment credits are depleted. Please go to AI Studio … ». À 10:54:56.743 UTC : « Your credit balance is too low to access the Anthropic API … ». Les deux objets exposaient `statusCode:500`, `code:UNKNOWN`, `isRetryable:true`. Un seul envoi manuel ; le client peut automatiquement relancer une erreur transitoire. Aucun statut HTTP fournisseur ni identifiant de requête n'a été fourni. Le compteur d'usage inchangé n'établit pas une dépense nulle.

## Correction préparée

Classification commune des seuls signaux explicites de crédit épuisé, y compris les erreurs SDK imbriquées. Code `PROVIDER_CREDITS_EXHAUSTED`, erreur de service 503 non réessayable et message expurgé. Même contrat avant et pendant le flux. Alerte FR/EN distincte du quota du forfait, sans relance automatique ni boutons de nouvelle génération. Le repli existant reconnaît aussi le message de prépaiement. Si le fournisseur est connu sans crédits et qu’aucun candidat autorisé disponible ne reste, le serveur lève la même erreur sans rappeler ce compte. Aucun fournisseur ajouté, aucune clé modifiée.

## Validation et limites

93 tests passent : classification, vrai encodeur de flux du SDK avec erreurs synthétiques, rendu DOM FR/EN, i18n, inventaire et sélection du repli avec fixtures isolées. Aucun appel fournisseur dans ces tests. Typecheck web, lint ciblé et build client/SSR réussis. Revue indépendante : omissions du champ `detail` et priorité du crédit sur le libellé « API key » corrigées. L'exécution réelle reste bloquée sur la disponibilité fournisseur ; cette correction ne recharge aucun crédit et ne prouve pas la réussite de génération, GitHub ou publication.

Complément : 10 tests du handler passent, dont deux nouveaux cas HTTP EN/FR. Une erreur synthétique injectée au démarrage du flux SDK exerce le vrai catch de la route : HTTP 503, code dédié, non-réessayable, message localisé sans marqueur privé même si le diagnostic contient « API key ». Revue indépendante favorable. Aucun appel fournisseur réel.
