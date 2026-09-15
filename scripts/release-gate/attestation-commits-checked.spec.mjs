/**
 * ATTESTATION-CHECKS-001 — un commit généré doit porter de VRAIS contrôles.
 *
 * Les pushes faits avec `GITHUB_TOKEN` ne redéclenchent aucun workflow — c'est
 * voulu, sinon le workflow d'attestation se relancerait sur son propre commit,
 * indéfiniment. Mais la porte de déploiement exige des contrôles verts pour CE
 * commit exact : un commit d'attestation en tête de `main` bloquait donc tout
 * déploiement automatique.
 *
 * Deux fausses solutions écartées, et ce test les interdit :
 *   — exempter le bot de la porte ;
 *   — faire remonter la porte au dernier commit humain, ce qui déploierait le
 *     contenu d'un commit jamais contrôlé.
 *
 * La vraie : le workflow DEMANDE les contrôles requis sur le SHA qu'il vient de
 * créer.
 *
 * Fichiers lus COMMENTAIRES RETIRÉS, et ancres sur du CODE (clés YAML), jamais
 * sur de la prose : les commentaires ci-dessous citent `actions: read` et
 * `GITHUB_TOKEN`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const strip = (text) =>
  text
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

const PARITY = strip(fs.readFileSync(path.join(root, '.github/workflows/parity-registries.yml'), 'utf8'));
const CI = strip(fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'));
const E2E = strip(fs.readFileSync(path.join(root, '.github/workflows/e2e.yml'), 'utf8'));
const DEPLOY = strip(fs.readFileSync(path.join(root, '.github/workflows/deploy-main.yml'), 'utf8'));

describe('ATTESTATION-CHECKS-001 — les commits générés sont contrôlés', () => {
  it('les workflows requis acceptent un déclenchement à la demande', () => {
    // Sans cela, le dispatch échouerait et le commit resterait sans contrôle.
    expect(CI).toMatch(/workflow_dispatch:/);
    expect(E2E).toMatch(/workflow_dispatch:/);
  });

  it('l’attestation demande ces contrôles après avoir poussé', () => {
    expect(PARITY).toMatch(/gh workflow run/);
    expect(PARITY).toMatch(/ci\.yml/);
    expect(PARITY).toMatch(/e2e\.yml/);
  });

  it('elle en a le droit — `actions: write`, pas seulement `read`', () => {
    expect(PARITY).toMatch(/actions:\s*write/);
  });

  it('elle ne demande les contrôles QUE si elle a réellement poussé', () => {
    // Un dispatch sur un commit qui n'existe pas gaspille un run et brouille
    // l'historique des contrôles.
    expect(PARITY).toMatch(/pushed=true/);
    expect(PARITY).toMatch(/steps\.attest\.outputs\.pushed == 'true'/);
  });

  it('un échec de dispatch est FATAL, pas silencieux', () => {
    // Laisser passer reviendrait à retomber dans le cas qu'on corrige : un
    // commit en tête de `main` que la porte refusera plus tard, sans que
    // personne ne sache pourquoi.
    const block = PARITY.slice(PARITY.indexOf('gh workflow run'));

    expect(block.slice(0, 400)).toMatch(/exit 1/);
  });

  it('ne dispatche JAMAIS le workflow d’attestation lui-même', () => {
    // Ce serait la boucle que l'absence de redéclenchement évite.
    const block = PARITY.slice(PARITY.indexOf('for wf in'));

    expect(block.slice(0, 200)).not.toMatch(/parity-registries/);
  });

  it('la porte de déploiement continue d’exiger le commit EXACT', () => {
    // Le correctif ne doit pas avoir desserré la porte au passage.
    expect(DEPLOY).toMatch(/required checks green for THIS commit/i);
  });
});
