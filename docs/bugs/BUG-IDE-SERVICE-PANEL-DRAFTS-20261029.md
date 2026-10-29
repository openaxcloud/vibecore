---
id: BUG-IDE-SERVICE-PANEL-DRAFTS-20261029
---

# Brouillons perdus au remplacement responsive

## Bug reproduit

Les filtres Env/Secrets, le profil Security et les champs non soumis Collaborators sont perdus lorsque les vrais nœuds sont remplacés. Env/Secrets : trois témoins rouges chacun ; Security : trois pertes1280→390 ; Collaborators : trois pertes après commit mobile, deux identités de nœuds détachés directement établies.

## États distincts

| 📤 Dispatché | Correctif local | 💻 Codé sur main | ✅ Testé live production |
| --- | --- | --- | --- |
| ☑ Diagnostic29/10/2026 | ☑ Correctif validé localement, non livré | ☐ Non fusionné | ☐ Non testé en production |

## Portée et validation restante

Correctif local en cours de validation : réutiliser le provider éphémère isolé par projet/fenêtre/panneau. Filtres Env/Secrets uniquement ; profil Security ; formulaire Collaborators non secret avec rôle, chemin et ligne. Aucune valeur Env/secret, autorisation serveur, lien/token, localStorage/sessionStorage ou soumission automatique. Les réponses doivent consommer seulement la version confirmée du formulaire, sans effacer une saisie plus récente.

Preuves Chromium locales, API/runtime et données synthétiques ; aucun secret réel, mutation client, ressource ou accès créé. Les contre-preuves DOM ne constituent pas une validation compilée après correction. Les tests/sources du lot sont encore en évolution ; aucun total final de tests n’est revendiqué.

[Dossier de preuves](ui-service-panels-evidence-20261029/README.md), sources : `env-secrets/README.md ; studio-security/README.md ; collab-draft/README.md`. Les premiers échecs de harnais et timeouts avantGET sont conservés dans les reçus ; aucune réparation par simple reprise n’est revendiquée. Pas de certification globale/Safari/appareil physique/backend réel. RetourB→A#834 et README restent des incidents distincts.

## Mise à jour de validation locale

Validation compilée disponible : filtres Env3/3 et Secrets3/3 (390/820/1280, aller-retour avec ancien nœud détaché), profil Security3cas visés réussis, formulaire complet Collaborators3/3 (1280→390→1280). Le rôle est une sélection UI non soumise, jamais un grant ; chemin et ligne de commentaire restent associés au corps. Champs typés en liste autorisée, mémoire projet/panneau ; consommation atomique de la version entière confirmée, éditions plus récentes et ABA conservées dans les tests. Aucune soumission navigateur. Security820→390 n’avait pas de remontage : échec de précondition conservé, recette820→1280 distincte réussie. Build/CI/livraison finale du lot restent à confirmer par le parent.

## Verdict local final

Assemblage final : build client/SSR vert ;136/136 tests de huit suites finales et16tests inventaire déjà verts (totaux non additionnables aux sous-suites). Typage complet avant derniers deltas Tooltip/shrink-0 vert, puis typage web final vert ; lint0erreur/52avertissements préexistants. Les preuves compilées de brouillons décrites plus haut restent locales/synthétiques, sans soumission réelle ni permission attribuée.
