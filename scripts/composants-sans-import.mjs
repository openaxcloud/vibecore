import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

export function modulesReferences(source, chemin, racine) {
  const references = new Set();

  const arbre = ts.createSourceFile(
    chemin,
    source,
    ts.ScriptTarget.Latest,
    true,
    chemin.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const enregistrer = (expression) => {
    if (!expression || !ts.isStringLiteralLike(expression)) {
      return;
    }

    const cible = expression.text;

    if (cible.startsWith('~/') || cible.startsWith('.')) {
      references.add(
        resolve(
          cible.startsWith('~/') ? racine : dirname(chemin),
          cible.startsWith('~/') ? cible.slice(2) : cible,
        ).replace(/\.(?:[cm]?[jt]sx?)$/, ''),
      );
    }
  };
  const visiter = (noeud) => {
    if (ts.isImportDeclaration(noeud) || ts.isExportDeclaration(noeud)) {
      enregistrer(noeud.moduleSpecifier);
    }

    if (
      ts.isCallExpression(noeud) &&
      (noeud.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(noeud.expression) && noeud.expression.text === 'require'))
    ) {
      enregistrer(noeud.arguments[0]);
    }

    ts.forEachChild(noeud, visiter);
  };
  visiter(arbre);

  return references;
}

export function inventorierComposants(racine) {
  const fichiers = [];

  const parcourir = (dossier) => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = resolve(dossier, entree.name);

      if (entree.isDirectory()) {
        parcourir(chemin);
      } else if (/\.tsx?$/.test(entree.name) && !/\.(?:spec|test)\./.test(entree.name)) {
        fichiers.push(chemin);
      }
    }
  };
  parcourir(racine);

  const references = new Set();

  for (const chemin of fichiers) {
    for (const cible of modulesReferences(readFileSync(chemin, 'utf8'), chemin, racine)) {
      references.add(cible);
    }
  }

  const prefixe = resolve(racine, 'components') + '/';
  const composants = fichiers.filter((chemin) => chemin.startsWith(prefixe) && !/\/index\.tsx?$/.test(chemin));

  return {
    sourcesExaminees: fichiers.length,
    composantsExamines: composants.length,
    sansImport: composants
      .filter((chemin) => !references.has(chemin.replace(/\.tsx?$/, '')))
      .map((chemin) => chemin.slice(prefixe.length).replace(/\.tsx?$/, ''))
      .sort(),
    references,
  };
}
