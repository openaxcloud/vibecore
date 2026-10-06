// Lecture seule : paquets du magasin pnpm de l'image, avec leur taille disque.
const fs = require('fs'), path = require('path');
const pnpm = path.join(process.argv[2], 'node_modules', '.pnpm');
function taille(d) { let t = 0; const pile = [d]; while (pile.length) { const c = pile.pop(); let e; try { e = fs.readdirSync(c, { withFileTypes: true }); } catch { continue; } for (const x of e) { const p = path.join(c, x.name); if (x.isSymbolicLink()) continue; if (x.isDirectory()) pile.push(p); else { try { t += fs.statSync(p).size; } catch {} } } } return t; }
const out = [];
for (const e of fs.readdirSync(pnpm)) { if (e === 'node_modules' || e === 'lock.yaml') continue; const m = e.match(/^(@[^+]+\+[^@]+|[^@]+)@/); if (!m) continue; out.push([m[1].replace('+', '/'), e, taille(path.join(pnpm, e))]); }
process.stdout.write(JSON.stringify(out));
