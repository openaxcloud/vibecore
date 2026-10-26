# Safe areas : capacité indisponible dans Chromium local

Vérification empirique le 26 octobre 2026, Chromium154.0.8037.57 (/usr/bin/chromium), profil éphémère Playwright/CDP.

Un seul appel de capacité effectué : Emulation.setSafeAreaInsets avec insets {top:44,bottom:34,left:0,right:0}. Résultat : Protocol error (Emulation.setSafeAreaInsets): 'Emulation.setSafeAreaInsets' wasn't found. Voir probe.json et probe.cjs. Il s'agit d'une commande absente du protocole local, pas d'un refus d'autorisation. Aucun nouvel appel de cette commande après cet échec.

Une mesure indépendante des valeurs CSS par défaut donne top/bottom/left/right=0px via computedStyle sur padding:env(safe-area-inset-*,0px), dans une page vierge. Voir default-env.json/cjs. Cela vérifie les valeurs par défaut uniquement et ne démontre pas la propagation d'insets simulés non nuls.

En conséquence, aucun cas de simulation safe-area Security/Switcher/navigation basse/modal n'est compté comme exécuté aux formats320/390/844×390/820. Aucune capture avec padding injecté ne remplace cette preuve manquante. Aucun test iOS physique ni clavier virtuel réel réalisé.

Xvfb et xdotool absents selon le parent ; aucune installation/permission demandée. Zoom natif pendant saisie non exécuté via outil OS ; pinch CDP et rétrécissement viewport ne sont pas présentés comme équivalents à zoom natif ou clavier virtuel. Aucun contournement, source/index/commit ou fixture modifié. Tous les navigateurs ouverts pour ces deux sondes ont été fermés. Serveur10599 conservé pour le parent.
