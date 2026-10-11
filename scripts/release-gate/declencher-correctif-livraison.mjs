import { pathToFileURL } from 'node:url';

export async function declencherCorrectifLivraison({ depot, sha, token, requete = fetch }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(depot ?? '') || !/^[a-f0-9]{40}$/.test(sha ?? '')) {
    throw new Error('Dépôt ou SHA invalide. Aucun déploiement demandé.');
  }
  if (!token) throw new Error('Jeton Actions absent. Déclenchement refusé.');
  const base = `https://api.github.com/repos/${depot}/actions/workflows/deploy-main.yml`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
  // Un push mêlant workflow et code produit déclenche déjà deploy-main.yml.
  // Ne pas mettre un second rollout du même commit dans sa file.
  const liste = await requete(`${base}/runs?branch=main&event=push&head_sha=${sha}&per_page=100`, { headers });
  if (!liste.ok)
    throw new Error(`Lecture des déploiements refusée (HTTP ${liste.status}). Aucun nouveau déploiement demandé.`);
  const donnees = await liste.json();
  if (!Array.isArray(donnees?.workflow_runs))
    throw new Error('Liste des déploiements illisible. Aucun nouveau déploiement demandé.');
  const existant = donnees.workflow_runs.some(
    (run) =>
      run.head_sha === sha &&
      run.event === 'push' &&
      (['pending', 'queued', 'requested', 'waiting', 'in_progress'].includes(run.status) ||
        run.conclusion === 'success'),
  );
  if (existant) return 'existant';
  const reponse = await requete(`${base}/dispatches`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ref: 'main', inputs: { target_sha: sha } }),
  });
  if (!reponse.ok) {
    // Ne jamais réimprimer le corps renvoyé par un service distant.
    throw new Error(
      `Déclenchement refusé par GitHub (HTTP ${reponse.status}). Lancez deploy-main.yml manuellement sur main pour ${sha}.`,
    );
  }
  return 'demande';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const resultat = await declencherCorrectifLivraison({
      depot: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      token: process.env.GH_TOKEN,
    });
    console.log(
      `Déploiement ${resultat === 'existant' ? 'déjà présent' : 'demandé'} pour ${process.env.GITHUB_SHA}. Son succès doit encore être vérifié dans Actions.`,
    );
  } catch (erreur) {
    console.error(erreur.message);
    process.exitCode = 1;
  }
}
