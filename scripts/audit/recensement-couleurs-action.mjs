import fs from 'node:fs';
import path from 'node:path';

const fichiers = [];
const parcourir = (d) => { for (const e of fs.readdirSync(d, {withFileTypes:true})) {
  const p = path.join(d, e.name);
  if (e.isDirectory()) { if (e.name !== 'node_modules') parcourir(p); }
  else if (/\.(tsx?|scss)$/.test(e.name)) fichiers.push(p);
} };
parcourir('app');

const JETON = /--vc-(ide-accent-action|action-primary|cta-accent)/;
const familles = { primaire: [], secondaire: [], semantique: [], definition: [], ambigu: [] };
let total = 0;

for (const f of fichiers) {
  const lignes = fs.readFileSync(f, 'utf8').split('\n');
  lignes.forEach((l, i) => {
    if (!JETON.test(l)) return;
    total++;
    const e = { ref: `${f}:${i+1}`, extrait: l.trim().slice(0, 100), spec: /\.spec\./.test(f) };

    if (/^\s*--vc-[a-z-]+:\s/.test(l)) { familles.definition.push(e); return; }

    // fond : CSS classique, utilitaire Tailwind, ou style inline JS
    const fond = /background(-color)?:\s*(var\()?--vc-/.test(l)
      || /\bbg-\[var\(--vc-/.test(l)
      || /background:\s*'var\(--vc-/.test(l);
    // teinte / mélange : ce n'est pas un aplat d'action
    const teinte = /color-mix\(|_\d+%,|\/\s*\d+%\)/.test(l);
    // texte / icône
    const texte = /(^|[^-])color:\s*(var\()?--vc-/.test(l)
      || /\btext-\[var\(--vc-/.test(l)
      || /color:\s*'var\(--vc-/.test(l);
    // bordure, anneau de focus, contour, ombre
    const bordure = /border[a-z-]*:\s*[^;]*var\(--vc-/.test(l)
      || /\b(ring|border|outline|shadow)-\[var\(--vc-/.test(l)
      || /outline[a-z-]*:\s*[^;]*var\(--vc-/.test(l)
      || /box-shadow:[^;]*var\(--vc-/.test(l);

    if (fond && !teinte) { familles.primaire.push(e); return; }
    if (teinte || bordure) { familles.semantique.push({...e, role:'bordure/anneau/teinte'}); return; }
    if (texte) { familles.semantique.push({...e, role:'texte/icône'}); return; }
    familles.ambigu.push(e);
  });
}

// Déclinaisons neutres concurrentes (action secondaire) : on regarde les classes de FOND
// posées sur des éléments cliquables, toutes surfaces confondues.
const neutres = new Map();
for (const f of fichiers) {
  if (!/\.tsx$/.test(f) || /\.spec\./.test(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  for (const l of src.split('\n')) {
    if (!/button|Button|role="button"|onClick/.test(l)) continue;
    for (const m of l.matchAll(/\bbg-(bolt-elements-[a-zA-Z-]+|gray-\d{2,3}|neutral-\d{2,3}|slate-\d{2,3}|zinc-\d{2,3}|white|transparent)\b/g)) {
      neutres.set(m[1], (neutres.get(m[1]) ?? 0) + 1);
    }
  }
}

console.log(`\n### Recensement des jetons d'action — ${total} usages dans app/\n`);
const p = (n, t) => `${String(n).padStart(4)}  ${t}`;
console.log(p(familles.primaire.length,   'ACTION PRIMAIRE — aplat accent (fond plein)'));
console.log(p(familles.semantique.length, 'SÉMANTIQUE — texte, icône, bordure, anneau, teinte'));
console.log(p(familles.definition.length, 'DÉFINITIONS de jetons (ne peignent rien)'));
console.log(p(familles.ambigu.length,     'AMBIGU — à trancher à la main'));
console.log(`\n### Action secondaire : déclinaisons neutres concurrentes sur des éléments cliquables\n`);
const tri = [...neutres.entries()].sort((a,b)=>b[1]-a[1]);
tri.slice(0,12).forEach(([v,n]) => console.log(p(n, `bg-${v}`)));
console.log(`\n  → ${neutres.size} déclinaisons distinctes`);
console.log(`\n### Ambigus restants (10 premiers)\n`);
familles.ambigu.slice(0,10).forEach(a => console.log(`  ${a.ref}\n     ${a.extrait}`));
