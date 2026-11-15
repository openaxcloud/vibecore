# Liaison dormante des admissions Publish

Sur main 2073f302. Aucun changement de configuration, réseau, IAM ou activation
restauration. La garde 503 reste inchangée. Aucun ticket n'est soldé.

Lorsque beforeEffects est injecté, le runner réserve un UUID d'exécution avant
l'admission. Le ticket persiste `publish-migration:<UUID>` dans ownerIncarnation :
il s'agit de l'incarnation de cette tentative, pas d'un worker réutilisable. Le
journal est créé avec ce même UUID et le snapshot conserve l'identité déterministe
`mig_<UUID>`. Sans admission injectée, la génération historique des IDs est inchangée.
Si le store ne respecte pas l'ID réservé, aucun appel fournisseur ni SQL ne démarre.

Cette convention interne utilise des champs existants, sans nouvelle migration.
La perte d'un accusé d'admission ou de journal ne déclenche aucune reprise. Un
conflit de verrou peut conserver un ticket sans journal. Ces tickets restent
identifiables même lorsque l'appelant n'a reçu aucun ticket en réponse.

inspectPublishMigrationWork est une lecture interne, non exposée par HTTP. Le
consommateur doit authentifier la portée. Elle vérifie ticket, tenant, projet,
instance, environnement, version et cible, puis cherche le journal exact et
l'intention de snapshot scoped. Les observations sont explicitement NON atomiques.
Journal absent signifie « non observé », jamais « aucun effet » : un commit peut
encore être en vol. Une provenance de snapshot n'est pas une preuve de complétion.
Même COMMITTED ou FAILED_SAFE ne donnent jamais canSettle ou canResume. Les anciens
tickets sans marqueur sont UNLINKED, jamais devinés ou migrés automatiquement.

Tests déterministes : corrélation des IDs, refus du mauvais ID, perte d'accusé du
journal/snapshot, conflit de verrou, lecture indéterminée et portée. La suite PG
jetable couvre le lien durable journal/snapshot et l'orphelin après admission
commise dont l'accusé est simulé perdu. Ce lot ne constitue ni une clôture des
effets externes ni une admission globale des runtimes/tâches/clients tiers.

Limite : avant création du journal, le ticket conserve l'UUID de tentative et sa
portée, mais pas la clé d'idempotence ni le déploiement. Ce lien permet le diagnostic
par UUID ; il ne permet pas de relancer automatiquement le Publish d'origine.
