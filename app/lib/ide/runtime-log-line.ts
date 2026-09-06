/*
 * Ligne de journal de l'environnement d'exécution, rendue LISIBLE.
 *
 * L'agent d'espace de travail journalise en JSON structuré, une ligne par
 * événement : {"level":"error","service":"workspace-agent","event":
 * "preview.proxy.unreachable","port":5173,…}. Le panneau Débogueur affichait
 * ces lignes telles quelles — et parfois tronquées par l'agent, donc
 * corrompues (« …"port":5173,' failed"} »), capture iPhone d'Avi du 05/09.
 *
 * On extrait ce qu'un humain cherche : le niveau, l'événement, le port ou le
 * message. JSON valide ou tronqué, même lecture ; et une ligne qui n'est pas
 * du JSON revient telle quelle.
 */
export interface LigneRuntimeLisible {
  niveau: string | null;
  texte: string;
}

const CHAMPS_TEXTE = ['message', 'msg', 'error', 'reason', 'detail'] as const;

function champTexte(objet: Record<string, unknown>): string | null {
  for (const champ of CHAMPS_TEXTE) {
    const valeur = objet[champ];

    if (typeof valeur === 'string' && valeur.trim()) {
      return valeur.trim();
    }
  }

  return null;
}

function depuisObjet(objet: Record<string, unknown>): LigneRuntimeLisible {
  const niveau = typeof objet.level === 'string' ? objet.level : null;
  const morceaux: string[] = [];

  if (typeof objet.service === 'string') {
    morceaux.push(objet.service);
  }

  if (typeof objet.event === 'string') {
    morceaux.push(objet.event);
  }

  if (typeof objet.port === 'number' || typeof objet.port === 'string') {
    morceaux.push(`port ${objet.port}`);
  }

  const texte = champTexte(objet);

  if (texte) {
    morceaux.push(texte);
  }

  return { niveau, texte: morceaux.length ? morceaux.join(' · ') : JSON.stringify(objet) };
}

/** Une ligne JSON coupée en plein vol : on récupère les champs encore lisibles. */
function depuisJsonTronque(ligne: string): LigneRuntimeLisible | null {
  const champ = (nom: string) => ligne.match(new RegExp(`"${nom}"\\s*:\\s*"([^"]*)"`))?.[1];
  const port = ligne.match(/"port"\s*:\s*(\d+)/)?.[1];
  const event = champ('event');

  if (!event && !champ('level')) {
    return null;
  }

  const objet: Record<string, unknown> = {};
  const level = champ('level');
  const service = champ('service');
  const message = champ('message') ?? champ('msg') ?? champ('error') ?? champ('reason');

  if (level) {
    objet.level = level;
  }

  if (service) {
    objet.service = service;
  }

  if (event) {
    objet.event = event;
  }

  if (port) {
    objet.port = Number(port);
  }

  if (message) {
    objet.message = message;
  }

  return depuisObjet(objet);
}

export function ligneRuntimeLisible(ligne: string): LigneRuntimeLisible {
  const brut = ligne.trim();

  if (!brut.startsWith('{')) {
    return { niveau: null, texte: brut };
  }

  try {
    const objet = JSON.parse(brut) as unknown;

    if (objet && typeof objet === 'object' && !Array.isArray(objet)) {
      return depuisObjet(objet as Record<string, unknown>);
    }
  } catch {
    const recupere = depuisJsonTronque(brut);

    if (recupere) {
      return recupere;
    }
  }

  return { niveau: null, texte: brut };
}

/*
 * La même lecture, en TEXTE — pour les journaux rendus dans un `<pre>` (volet
 * « Journaux du serveur » de la Webview) où il n'y a pas de balisage pour
 * porter le niveau : « [error] workspace-agent · preview.proxy.unreachable ·
 * port 5173 · fetch failed » au lieu de la ligne JSON brute.
 */
export function texteRuntimeLisible(ligne: string): string {
  const lisible = ligneRuntimeLisible(ligne);

  return lisible.niveau ? `[${lisible.niveau}] ${lisible.texte}` : lisible.texte;
}
