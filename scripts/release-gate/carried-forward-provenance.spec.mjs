/**
 * La règle de provenance, appliquée au FICHIER de workflow réel.
 *
 * Trois fois de suite, un déploiement de production a été bloqué par la même
 * confusion : une image REPRISE telle quelle (rien de neuf n'est expédié pour
 * elle) traitée comme une image RECONSTRUITE dont la provenance manquerait.
 *
 *   #256  la porte de provenance générique refusait `admin`
 *   #262  le constructeur de manifeste refusait ensuite le même `admin`
 *   ici   le bloc dédié à l'agent de workspace refusait à son tour
 *
 * Chaque correctif ne rendait visible que le suivant. Ce test fige la règle une
 * fois pour toutes, sur les deux versants :
 *
 *   RECONSTRUIT  → la provenance est OBLIGATOIRE, l'échec est dur.
 *   REPRIS       → le trou est ENREGISTRÉ, jamais inventé, et n'arrête rien.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const WORKFLOW = path.join(process.cwd(), '.github/workflows/deploy-main.yml');
const source = fs.readFileSync(WORKFLOW, 'utf8');

/** Le bloc dédié à l'agent de workspace, isolé de ses voisins. */
function wsagentBlock() {
  const start = source.indexOf('WORKSPACE_AGENT_IMAGE is not set in the live configmap');
  expect(start, "le bloc de l'agent de workspace est introuvable").toBeGreaterThan(-1);

  const end = source.indexOf('# What is this service RUNNING right now?', start);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

describe('provenance — une image reprise ne bloque pas, une image reconstruite si', () => {
  it('donne au tier RECONSTRUIT le commit visé, sans détour', () => {
    // La branche `rebuilt=true` doit rester la voie courte et sûre : le commit
    // que ce run déploie EST le commit qui a produit l'image.
    expect(source).toMatch(/if \[ "\$\{rebuilt\}" = "true" \]; then[\s\S]{0,600}?SOURCE_SHA="\$\{TARGET_SHA\}"/);
  });

  it('refuse toujours un service RECONSTRUIT dont la provenance manque', () => {
    // Le refus dur du bloc générique est la garantie qui compte : une image
    // NEUVE sans commit est exactement ce que la porte existe pour arrêter.
    const marker = source.indexOf('cannot establish which commit produced');
    expect(marker).toBeGreaterThan(-1);

    // La garde `rebuilt=true` PRÉCÈDE le message : on ouvre la fenêtre en amont.
    const generic = source.slice(marker - 800, marker + 400);

    expect(generic).toMatch(/if \[ "\$\{rebuilt\}" = "true" \]; then[\s\S]{0,600}?exit 1/);
  });

  it("n'arrête plus le déploiement pour l'agent de workspace repris tel quel", () => {
    const block = wsagentBlock();
    const afterCandidate = block.slice(block.indexOf('CANDIDATE='));

    // Le seul `exit 1` admis dans ce bloc est celui de la référence ABSENTE du
    // configmap : là, il n'y a rien à épingler, donc rien à reprendre.
    expect(afterCandidate).not.toMatch(/exit 1/);
    expect(afterCandidate).toMatch(/::warning::/);
  });

  it("enregistre le trou au lieu d'inventer un commit", () => {
    const block = wsagentBlock();
    const afterCandidate = block.slice(block.indexOf('CANDIDATE='));

    // `SOURCE_SHA=""` — surtout pas `${TARGET_SHA}`, qui ferait dire au
    // manifeste que l'image vient du commit courant alors qu'elle est plus
    // ancienne.
    expect(afterCandidate).toMatch(/SOURCE_SHA=""/);
    expect(afterCandidate).not.toMatch(/SOURCE_SHA="\$\{TARGET_SHA\}"/);
  });

  it('conserve le refus dur quand le configmap ne référence AUCUNE image', () => {
    // Ce cas-là n'est pas une reprise : il n'y a rien à reprendre. Épingler
    // deviendrait impossible, et laisser passer remettrait un tag mutable dans
    // les workspaces clients.
    const block = wsagentBlock();
    const beforeCandidate = block.slice(0, block.indexOf('CANDIDATE='));

    expect(beforeCandidate).toMatch(/exit 1/);
  });
});
