# SPIKE ONLY — image jetable pour la Phase 0 (spike Nix). NE PAS DÉPLOYER.
# Protocole : docs/RUNTIME_NIX_PHASE0_SPIKE.md
#
# Base Debian (glibc) volontairement : Alpine/musl casse les wheels Python
# (numpy/pandas) et n'est de toute façon plus la cible de la Phase 1.
# curl + xz-utils : requis pour tirer le tarball Nix.
# /nix créé au CHEMIN CANONIQUE et possédé par uid 1000 : les chemins du cache
# binaire (cache.nixos.org) sont préfixés en dur par /nix/store — un magasin
# relocalisé perd le cache et recompile tout (rédhibitoire sous gVisor).
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl xz-utils ca-certificates procps coreutils \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -m 0755 /nix && chown 1000:1000 /nix \
  && mkdir -p /home/spike && chown 1000:1000 /home/spike

USER 1000
ENV HOME=/home/spike

CMD ["sleep", "infinity"]
