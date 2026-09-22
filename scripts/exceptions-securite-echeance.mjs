/*
 * Les exceptions de sécurité qui arrivent à terme, dites LÀ OÙ ON LES LIT.
 *
 * L'alerte existait déjà — mais seulement dans le journal du déploiement, une
 * page que personne n'ouvre tant que rien ne casse. Le 2026-09-17, DIX-HUIT
 * exceptions sont tombées le même matin après avoir été annoncées pendant des
 * jours dans ce journal ; la livraison est restée fermée cinq jours.
 *
 * Ce script sort donc le même calcul du workflow de déploiement pour qu'il
 * tourne AUSSI sur les propositions, où quelqu'un le verra avant la panne.
 *
 * Il n'échoue jamais sur une échéance proche : un avertissement qui bloque
 * devient un obstacle qu'on contourne. Il n'échoue que sur une exception DÉJÀ
 * échue, parce qu'à ce moment la porte de livraison refusera de toute façon —
 * autant le dire sur la proposition plutôt qu'au déploiement.
 */
import { readdirSync, readFileSync } from 'node:fs';

const JOURS = Number(process.env.SEUIL_JOURS ?? 7);
const bloquant = process.argv.includes('--bloquant');

const jour = (d) => d.toISOString().slice(0, 10);
const aujourdhui = jour(new Date());
const limite = jour(new Date(Date.now() + JOURS * 86_400_000));

const fichiers = readdirSync('.').filter((f) => f === '.trivyignore' || f.startsWith('.trivyignore.'));
const lignes = [];

for (const fichier of fichiers) {
  for (const ligne of readFileSync(fichier, 'utf8').split('\n')) {
    const trouve = /^(CVE-\d{4}-\d+)\s+exp:(\d{4}-\d{2}-\d{2})/.exec(ligne.trim());

    if (trouve) {
      lignes.push({ fichier, cve: trouve[1], expire: trouve[2] });
    }
  }
}

const echues = lignes.filter((l) => l.expire < aujourdhui);
const proches = lignes.filter((l) => l.expire >= aujourdhui && l.expire < limite);

for (const l of echues) {
  console.log(`::error::exception ÉCHUE — ${l.fichier} : ${l.cve} a expiré le ${l.expire}. La livraison est fermée.`);
}

for (const l of proches) {
  console.log(
    `::warning::exception proche de l'échéance — ${l.fichier} : ${l.cve} expire le ${l.expire}. ` +
      `Traiter AVANT cette date, sinon la livraison se fermera.`,
  );
}

console.log(`exceptions : ${lignes.length} au total, ${echues.length} échue(s), ${proches.length} sous ${JOURS} jours`);

if (bloquant && echues.length > 0) {
  process.exitCode = 1;
}
