/**
 * Détecteur de PRÉSENCE DE CONTENU — remplace le détecteur de stabilité.
 *
 * Défaut corrigé : l'ancien déclarait « stable » après 3 lectures identiques à
 * 100 ms. Un PALIER TRANSITOIRE le déclenchait — mesuré le 2026-09-05, il a
 * rendu 162 caractères comme état final sur un panneau qui en porte 915. Il
 * mesurait l'immobilité, pas la présence.
 *
 * Critère PRINCIPAL : un MARQUEUR sémantique connu du panneau, ou à défaut un
 * volume au-dessus du plancher de chargement.
 *
 * ⚠️ LIMITE STRUCTURELLE du seuil de longueur, mesurée le 2026-09-05 : le
 * panneau `secrets` correctement rendu à vide fait 54 caractères
 * (« Aucun secret de projet. »), soit MOINS que son propre message de
 * chargement (83). Aucun seuil ne peut distinguer ce cas d'un panneau mort.
 * Pour tout panneau susceptible d'avoir un état vide, seul un marqueur vaut.
 * Critère SECONDAIRE : la longueur doit ensuite rester stable 5 lectures.
 */
export const MARQUEURS = {
  overview: ['PROJECT OVERVIEW'],
  integrations: ['Add Authentication', 'Integration Hub'],
  packages: ['AVAILABLE', 'Dependencies', 'package'],
  collaborators: ['Presence', 'Role-based'],
  env: ['Portées différentielles', 'Rechercher des variables', 'Differential scopes'],
  secrets: ['Nouveau secret', 'Aucun secret', 'New secret', 'No project secrets', 'Importer .env'],
  logs: ['Journaux système', 'System logs', 'Console'],
  extensions: ['Extensions', 'MCP'],
  settings: ['Paramètres', 'Settings'],
};

export async function attendreContenu(page, panel, { timeoutMs = 45000, pas = 100 } = {}) {
  const sel = `[data-testid="ide-service-panel"][data-panel="${panel}"]`;
  const marqueurs = MARQUEURS[panel] || [];
  const t0 = Date.now();
  let plancher = null, derniere = -1, stables = 0, tFranchi = null, raison = null;

  while (Date.now() - t0 < timeoutMs) {
    const m = await page.evaluate(
      ([s, mk]) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const t = (el.innerText || '').trim();
        return { len: t.length, marque: mk.some((k) => t.includes(k)) };
      },
      [sel, marqueurs],
    );
    if (m) {
      if (plancher === null) plancher = m.len;
      /*
       * Seuil ASSOUPLI. L'ancien (x3 et +200) ratait `env` de HUIT caracteres :
       * il rend 275 caracteres stables pour un plancher de 83, donc un vrai
       * contenu, refuse par un seuil a 283. Un seuil trop strict fabrique un
       * faux echec, exactement comme un seuil trop laxiste fabrique un faux
       * succes.
       */
      const seuil = Math.max(plancher * 2, plancher + 100);
      const franchi = m.marque || m.len >= seuil;
      if (franchi && tFranchi === null) { tFranchi = Date.now() - t0; raison = m.marque ? 'marqueur' : 'seuil'; }
      if (franchi) {
        /*
         * Stabilite TOLERANTE. L'egalite stricte ne peut jamais tenir sur un
         * panneau vivant : `logs` oscille entre 352 et 357 caracteres parce
         * qu'il affiche des journaux qui arrivent. On accepte 5 % de variation.
         */
        const proche = derniere > 0 && Math.abs(m.len - derniere) <= Math.max(3, derniere * 0.05);
        if (proche) { if (++stables >= 5) return { ok: true, ms: Date.now() - t0, tFranchi, raison, len: m.len, plancher }; }
        else stables = 0;
        derniere = m.len;
      }
    }
    await new Promise((r) => setTimeout(r, pas));
  }
  return { ok: false, raison: 'timeout', plancher, derniere, tFranchi };
}
