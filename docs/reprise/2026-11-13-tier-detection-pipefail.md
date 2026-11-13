# Détection des tiers : faux négatif SIGPIPE

## Contre-preuve

La CI de PR923 au SHA `788927f1ffb05256de3adeee0f09f03aea4e0a68` a
échoué sur `base-du-dernier-deploiement.spec.ts:276` : screenshotter + admin
produisait runtime=true, admin=false. Le lot runtime ne changeait pas ce workflow.
Le fichier deploy-main est identique sur cette PR et sur main
`ed5c9d9ca0b24e3e8d37dc00887f9e2fa9077795` : blob
`c87782804b12cabd7ceee8025089a2692dd7b9c5`.

Le petit scénario existant passe localement (6/6) : il est sensible à
l'ordonnancement. Un scénario ajouté crée un dépôt synthétique avec admin,
screenshotter et 4 000 chemins de documentation. Le script réel du workflow est
exécuté via le garde existant : **ancien code, 1 échec/6 succès**, admin=false.
La liste dépasse un tampon de pipe. `grep -q` s'arrête au premier chemin admin,
`printf` reçoit SIGPIPE et `pipefail` transforme la présence en faux négatif.
Le `|| true` existant masque ensuite l'erreur et laisse ADMIN=false.

## Correction et validation

Les cinq recherches sur CHANGED utilisent maintenant `grep -E ... > /dev/null`
au lieu de `grep -Eq ...`. Grep consomme tout le flux ; aucun pattern, choix de
base, garde de revue, garde de release ni autorisation n'est relâché.
Le scénario discriminant passe avec la correction : **7/7** dans Vitest.
Le fichier de test et le YAML sont formatés et contrôlés ; la CI complète reste
requise avant fusion. Aucun déploiement n'est lancé par ce travail.
