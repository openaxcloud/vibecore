# Diagnostic borné du retour interprojet après archive

Le rouge de #834 reste non résolu : l'assertion `.cm-content` contenant
`TEMPORARY-README` échouait après HTTP 200, sur trois tentatives. L'isolation
avant réception avait passé ; aucune fuite ou écriture interprojet démontrée.

Le test conserve son assertion, son délai et son timeout90s. Un observateur
sans mutation DOM démarre juste avant la libération de l'archive réelle. Une
WeakMap attribue des identifiants éphémères aux nœuds éditeur ; au maximum32
états sont conservés, pendant10s au plus. Le `finally` de l'assertion attache
le montage, les catégories routeur/projet A/B/autre, la présence des surfaces
et le focus, y compris après échec. Les contenus de fixtures ne deviennent
que des booléens ; aucun texte DOM, URL, identifiant projet, chemin de fichier,
valeur de formulaire ou secret n'est attaché. Chaque opération de diagnostic
a une attente bornée à2s et ne remplace pas le verdict de l'assertion. Cette
borne n'annule pas une évaluation ou un attachement déjà commencé, qui peut
terminer ultérieurement. L'observateur est nettoyé dans le `finally` extérieur
et possède sa propre limite après installation. L'instrumentation ajoute une
étape avant libération de l'archive : un passage vert instrumenté ne démontre
pas que la course est corrigée.

Validation locale sur le build main `e03b3f856` (produit inchangé) : test
instrumenté final1/1 direct en17,5s, zéro reprise/ignoré. Son attachement existe
et montre le host initial puis CodeMirror après archive, routeur A/editor/idle.
Trois contre-tests synthétiques externes passent : remplacement détecté sans
texte sensible, erreur d'attachement préservant l'assertion originale, évaluation
bloquée bornée et erreur synchrone avalée. Lint et format ciblés passent.

Le navigateur local est Chromium système154.0.8037.57, pas le navigateur CI.
Les contre-tests ne sont pas ajoutés à la découverte CI ; le helper n'ajoute
aucun scénario autonome. Avant instrumentation, le test exact passait14,4s.
Deux sondes d'ordre ide-state/archive passaient mais n'interceptaient aucun
GET ide-state : elles ne prouvent pas cet ordre. Les erreurs initiales du
harness local (montage des packages puis exécution du contre-test avec tsx)
sont conservées dans les preuves locales ; elles ne sont pas des rouges produit.

Aucune trace CI refusée n'a été consultée. API/PostgreSQL/Redis locaux et données
synthétiques uniquement, sans fournisseur, DNS ou publication cliente. Ces
captures doivent aider le prochain échec à fournir une cause ; elles ne
constituent ni une correction de #834, ni une validation de production.
