/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseSettings } from './DatabaseSettings';

/*
 * RP-DB-09 — la carte « Connection string ».
 *
 * Le défaut n'était pas visible en lisant la vue : elle attendait la valeur
 * dans `connectionString`, prop alimentée par la LISTE des secrets. Or
 * `listProjectSecrets` retire `valueEncrypted` et n'expose aucun `value` —
 * la prop valait donc TOUJOURS `undefined`, l'œil et le bouton copier
 * restaient éteints, et la carte n'affichait que des points. Une route de
 * révélation existait déjà, utilisée par le panneau Secrets ; personne ne la
 * branchait ici.
 *
 * Ce test tient les deux moitiés : les boutons sont vivants dès qu'un moyen
 * de révéler existe, et le geste rend la VRAIE valeur.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'fr', resolvedLanguage: 'fr' } }),
}));

vi.mock('./DatabaseRollbackPanel', () => ({ DatabaseRollbackPanel: () => <div /> }));

afterEach(cleanup);

const URL_REELLE = 'postgresql://app:motdepasse@db.interne:5432/app';

describe('carte « Connection string »', () => {
  it('révèle la valeur DEMANDÉE à la route, alors que la liste n’en porte aucune', async () => {
    const reveler = vi.fn().mockResolvedValue(URL_REELLE);

    render(<DatabaseSettings name="Base de développement" active reveler={reveler} />);

    // Rien n'est affiché tant qu'on n'a rien demandé.
    expect(screen.queryByText(URL_REELLE)).toBeNull();

    const oeil = screen.getByRole('button', { name: /Afficher|Reveal|Révéler/u }) as HTMLButtonElement;
    expect(oeil.disabled, 'l’œil doit être vivant : un moyen de révéler existe').toBe(false);

    fireEvent.click(oeil);

    await waitFor(() => expect(screen.getByText(URL_REELLE)).toBeTruthy());
    expect(reveler).toHaveBeenCalledTimes(1);
  });

  it('et reste éteinte quand aucun moyen de révéler n’est fourni', () => {
    render(<DatabaseSettings name="Base de développement" active />);

    const oeil = screen.getByRole('button', { name: /Afficher|Reveal|Révéler/u }) as HTMLButtonElement;
    expect(oeil.disabled).toBe(true);
  });
});
