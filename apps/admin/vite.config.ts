import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  /*
   * Cible de navigateurs EXPLICITE, et volontairement moderne.
   *
   * Sans `build.target`, Vite applique son défaut `modules`, qui se développe
   * en chrome87 / edge88 / es2020 / firefox78 / safari14 — des navigateurs de
   * 2020. Ce n'était pas un choix : personne ne l'avait jamais révisé, et
   * esbuild 0.27 refuse désormais de transformer un paramètre déstructuré vers
   * cette cible, ce qui a fermé la livraison le 2026-09-17.
   *
   * `apps/admin` est la console d'administration de la plateforme, pas le
   * produit public : elle n'est ouverte que par nous, sur un navigateur à jour.
   * Le produit public garde sa propre cible.
   */
  build: { target: 'es2022' },

  plugins: [react()],
  resolve: {
    alias: {
      '~': fileURLToPath(new URL('../../app', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
  },
});
