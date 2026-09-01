/**
 * @vitest-environment node
 *
 * La console d'administration doit montrer les quatre cles de fournisseurs d'IA
 * SANS que personne n'ait a en recopier une. La contrainte se tient a trois
 * endroits distincts, et chacun est garde separement ici — un correctif a
 * plusieurs mecanismes exige un test par mecanisme, le site d'appel compris :
 *
 *   1. la section lit la source REELLE (le secret Kubernetes, via
 *      GET /admin/providers/ai) et non une table a re-saisir ;
 *   2. la section est ATTEIGNABLE depuis la navigation — un endpoint correct
 *      derriere une entree de menu absente ne montre rien a personne ;
 *   3. les libelles sont traduits en anglais ET en francais — une cle i18n
 *      manquante afficherait son identifiant technique a l'ecran.
 */
import { describe, expect, it } from 'vitest';

import { adminSections, navGroups } from './admin.$section';
import { adminRouteCatalog } from '~/lib/i18n/catalogs/admin-route';

const SECTION = 'ai-provider-keys';

describe('console admin — cles des fournisseurs d’IA', () => {
  it('1. lit la source reelle du runtime, sans champ de re-saisie', () => {
    const config = adminSections[SECTION];

    expect(config).toBeDefined();

    /*
     * L'endpoint doit etre celui qui lit les variables d'environnement issues du
     * secret Kubernetes. Le pointer ailleurs — par exemple sur /admin/providers,
     * la table ProviderConfig, vide de cles en production — redonnerait un ecran
     * « aucune cle » et obligerait a en recopier une.
     */
    expect(config.endpoint).toBe('/admin/providers/ai');
    expect(config.primaryKey).toBe('providers');
  });

  it('2. est atteignable depuis la navigation, dans le groupe IA', () => {
    const groupe = navGroups.find((g) => g.items.includes(SECTION));

    expect(groupe, 'la section n’est dans AUCUN groupe de navigation').toBeDefined();

    // Le groupe IA est celui qui porte deja le registre des fournisseurs.
    expect(groupe?.items).toContain('providers');
  });

  it('3. affiche du texte, pas une cle technique, en anglais et en francais', () => {
    const config = adminSections[SECTION];

    for (const langue of ['en', 'fr'] as const) {
      const catalogue = adminRouteCatalog[langue] as Record<string, string>;

      for (const cle of [config.title, config.description]) {
        expect(cle, `libelle manquant pour ${langue}`).toBeTruthy();

        /*
         * `adminT` rend la valeur anglaise a la construction de la table ; on
         * verifie donc que le catalogue de CHAQUE langue porte bien une entree
         * pour les deux cles ajoutees, sinon l'utilisateur verrait
         * « admin.route.aiProviderKeys » a l'ecran.
         */
        expect(Object.keys(catalogue)).toContain('admin.route.aiProviderKeys');
        expect(Object.keys(catalogue)).toContain('admin.route.aiProviderKeysDescription');
        expect(catalogue['admin.route.aiProviderKeys']).not.toMatch(/^admin\.route\./);
        expect(catalogue['admin.route.aiProviderKeysDescription']).not.toMatch(/^admin\.route\./);
      }
    }

    // Les libelles francais doivent etre reellement traduits, pas recopies de l'anglais.
    expect(adminRouteCatalog.fr['admin.route.aiProviderKeys']).not.toBe(
      adminRouteCatalog.en['admin.route.aiProviderKeys'],
    );
  });
});
