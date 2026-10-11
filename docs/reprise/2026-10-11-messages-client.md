# A-23, A-24 — nom du mode et messages compréhensibles

Les branches de routage et de messages client sont intégrées par deux fusions réelles sur main 80f1de14. L’index dérivé est régénéré. Le mode par défaut conserve son invariant (actif, multiplicateur 1), mais le refus nomme `power`, présent dans la carte, au lieu d’`economy`, retiré. Les messages publics concernés utilisent le catalogue, y compris la ligne de journal de construction ; les codes internes gardent leur contrat.

89 assertions passent : quatre sur le routage et 85 sur les catalogues, les e-mails transactionnels et la construction statique. Remettre le catalogue public de main rend 39 cas rouges et quatre verts. Revenir aux deux fichiers de routage de main rend la garde de vocabulaire rouge. Types et constructions des packages API/billing passent. Le lint ciblé passe avec les conventions d’import relatives des services et l’exception déjà nécessaire pour le scanner JavaScript sans déclaration du test existant. Une constante regex inutilisée, signalée par le lint dans le fichier modifié, est retirée sans changer les réparations React.

État : préparé et testé, pas fusionné sur main ni servi. Aucun nouveau parcours live n’est revendiqué.
