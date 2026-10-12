// Lecture seule. N'imprime ni identifiant ni adresse : des comptes et des dates.
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const s = await c.query(`SELECT value FROM "SystemSetting" WHERE key = 'account.pendingDeletionUserIds'`);
    const v = s.rows[0]?.value;
    const ids = Array.isArray(v) ? v : Array.isArray(v?.ids) ? v.ids : [];
    console.log(JSON.stringify({ reglageTrouve: s.rowCount === 1, forme: Array.isArray(v) ? 'tableau' : typeof v, demandesEnAttente: ids.length }));
    const toutes = await c.query(`SELECT preferences->'accountDeletion'->>'requestedAt' AS demande, preferences->'accountDeletion'->>'purgedAt' AS purge FROM "User" WHERE preferences ? 'accountDeletion'`);
    const maintenant = Date.now(), J = 86400000;
    const lignes = toutes.rows.filter((r) => r.demande);
    const echues = lignes.filter((r) => !r.purge && maintenant - Date.parse(r.demande) > 14 * J);
    console.log(JSON.stringify({
      comptesAvecDemande: lignes.length,
      purges: lignes.filter((r) => r.purge).length,
      echuesNonPurgees: echues.length,
      plusAncienneDemandeJours: lignes.length ? Math.floor((maintenant - Math.min(...lignes.map((r) => Date.parse(r.demande)))) / J) : null,
      retardsJours: echues.map((r) => Math.floor((maintenant - Date.parse(r.demande)) / J) - 14).sort((a, b) => b - a),
    }));
    const contr = await c.query(`SELECT count(*)::int AS n FROM "User"`);
    console.log(JSON.stringify({ controlePositifUtilisateurs: contr.rows[0].n }));
  } finally { await c.end(); }
})().catch((e) => { console.log(JSON.stringify({ VERDICT: 'ERREUR DU SCRIPT', type: e.name, code: e.code })); process.exitCode = 1; });
