import { describe, expect, it } from 'vitest';

import { dependancesManquantes, messageInstallation } from './verifier-installation.mjs';

/** Le cas réel du 2026-09-04 : esbuild déclaré, absent de node_modules. */
const MANIFESTE = {
  dependencies: { react: '18.3.1' },
  devDependencies: { esbuild: '0.27.7', typescript: '5.6.2', '@types/node': '22.0.0' },
};

describe("le pré-commit doit nommer la vraie cause, pas accuser le code", () => {
  // DISCRIMINANT — sans ce contrôle, le défaut passe pour une erreur de type.
  it('repère une dépendance déclarée mais absente', () => {
    const existe = (chemin) => !chemin.includes('node_modules/esbuild');

    expect(dependancesManquantes(MANIFESTE, existe)).toEqual(['esbuild']);
  });

  // DISCRIMINANT — le message doit dire quoi faire, pas seulement que ça casse.
  it("donne la commande de réparation et dit que ce n'est pas le code", () => {
    const message = messageInstallation(['esbuild']);

    expect(message).toContain('pnpm install --frozen-lockfile');
    expect(message).toContain("Ce n'est pas une erreur de votre code");
    expect(message).toContain('esbuild');
  });

  // GARDE ASSUMÉE — passe des deux côtés à dessein : elle protège contre le
  // troc inverse, un contrôle si bavard qu'il refuserait toute installation
  // saine et finirait par être retiré.
  it('se tait quand tout est installé', () => {
    expect(dependancesManquantes(MANIFESTE, () => true)).toEqual([]);
    expect(messageInstallation([])).toBeNull();
  });

  // GARDE ASSUMÉE — un paquet de l'espace de travail absent ne se répare pas
  // par une réinstallation ; le dire enverrait sur une fausse piste.
  it('ignore les dépendances internes au dépôt', () => {
    const manifeste = { dependencies: { '@vibecore/billing': 'workspace:*', truc: 'link:../truc' } };

    expect(dependancesManquantes(manifeste, () => false)).toEqual([]);
  });
});
