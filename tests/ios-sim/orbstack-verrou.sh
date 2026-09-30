#!/bin/bash
# Verrou PARTAGÉ entre sessions pour OrbStack (Mac 8 Go) — règle d'Avi, 30/09.
#
# « Fermer OrbStack après usage » ne vaut que pour le DERNIER utilisateur : le 30/09,
# une session l'a éteint à la fin de son test pendant qu'une autre s'en servait
# (bases perdues en plein passage). D'où un compteur commun :
#   - chaque session l'INCRÉMENTE en commençant (`prendre`) ;
#   - le DÉCRÉMENTE en finissant (`rendre`) ;
#   - et ne quitte OrbStack que si le compteur retombe à 0.
#
# Fichiers communs à TOUTES les sessions (chemins fixes, à ne pas changer) :
#   /tmp/orbstack-sessions.compte   le compteur (un entier)
#   /tmp/orbstack-sessions.verrou   mutex (mkdir est atomique) autour de la lecture-écriture
#
# Usage : tests/ios-sim/orbstack-verrou.sh prendre|rendre|etat
# `prendre` rend 3 si le compteur n'a PAS été incrémenté (alors ne pas appeler `rendre`) ;
# tout autre code, même un échec de démarrage, veut dire « incrémenté » : il faudra rendre.
set -u
COMPTE=/tmp/orbstack-sessions.compte
VERROU=/tmp/orbstack-sessions.verrou

verrouiller() {
  for _ in $(seq 1 100); do
    mkdir "$VERROU" 2>/dev/null && return 0
    # Mutex abandonné (session tuée entre mkdir et rmdir) : plus de 30 s, on le reprend.
    if [ -n "$(find "$VERROU" -maxdepth 0 -mmin +0.5 2>/dev/null)" ]; then rmdir "$VERROU" 2>/dev/null; fi
    sleep 0.2
  done
  echo "orbstack-verrou : mutex $VERROU introuvable ou bloqué" >&2
  return 1
}
deverrouiller() { rmdir "$VERROU" 2>/dev/null; }
lire() { local n; n=$(cat "$COMPTE" 2>/dev/null); [[ "$n" =~ ^[0-9]+$ ]] && echo "$n" || echo 0; }

case "${1:-}" in
  prendre)
    verrouiller || exit 3   # 3 = compteur NON incrémenté : ne pas rendre
    n=$(( $(lire) + 1 )); echo "$n" > "$COMPTE"
    deverrouiller
    echo "orbstack-verrou : pris, $n utilisateur(s)"
    open -a OrbStack
    for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && exit 0; sleep 2; done
    echo "orbstack-verrou : OrbStack ne répond pas après 120 s" >&2; exit 1 ;;
  rendre)
    verrouiller || exit 1
    n=$(lire); n=$(( n > 0 ? n - 1 : 0 )); echo "$n" > "$COMPTE"
    deverrouiller
    # Filet : un conteneur qui tourne encore appartient à quelqu'un, même hors compteur.
    autres=$(docker ps -q 2>/dev/null | wc -l | tr -d ' ')
    if [ "$n" = 0 ] && [ "$autres" = 0 ]; then
      osascript -e 'quit app "OrbStack"' >/dev/null 2>&1
      echo "orbstack-verrou : rendu, dernier utilisateur — OrbStack quitté"
    else
      echo "orbstack-verrou : rendu, OrbStack laissé ($n utilisateur(s) au compteur, $autres conteneur(s) en marche)"
    fi ;;
  etat) echo "orbstack-verrou : $(lire) utilisateur(s) au compteur, $(docker ps -q 2>/dev/null | wc -l | tr -d ' ') conteneur(s) en marche" ;;
  *) echo "usage : $0 prendre|rendre|etat" >&2; exit 2 ;;
esac
