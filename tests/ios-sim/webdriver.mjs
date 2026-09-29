/*
 * Client WebDriver minimal pour `safaridriver`, sans dépendance.
 *
 * Pourquoi pas Playwright : son moteur `webkit` n'est pas Safari iOS. Il n'a ni
 * clavier logiciel, ni zoom au focus, ni barre d'outils qui recouvre la fenêtre
 * de mise en page — les trois défauts qu'Avi voit et que nos tests ne voyaient
 * pas. `safaridriver` pilote le VRAI Safari du simulateur.
 *
 * Toute réponse d'erreur du pilote lève une exception qui porte son message
 * d'origine : une erreur de l'instrument ne doit jamais ressembler à un
 * résultat (règle 20).
 */

const ELEMENT_KEY = 'element-6066-11e4-a52e-4f735466cecf';

export class SafariIos {
  constructor(sessionId, base) {
    this.sessionId = sessionId;
    this.base = base;
  }

  static async ouvrir({ base = 'http://localhost:4723', udid }) {
    const reponse = await appel(base, 'POST', '/session', {
      capabilities: {
        alwaysMatch: {
          browserName: 'Safari',
          platformName: 'iOS',
          'safari:useSimulator': true,
          ...(udid ? { 'safari:deviceUDID': udid } : {}),
        },
      },
    });

    return new SafariIos(reponse.sessionId, base);
  }

  commande(methode, chemin, corps) {
    return appel(this.base, methode, `/session/${this.sessionId}${chemin}`, corps);
  }

  aller(url) {
    return this.commande('POST', '/url', { url });
  }

  ajouterCookie(cookie) {
    return this.commande('POST', '/cookie', { cookie });
  }

  /** Exécute `script` (corps de fonction) dans la page et rend sa valeur. */
  executer(script, args = []) {
    return this.commande('POST', '/execute/sync', { script, args });
  }

  async trouver(selecteur) {
    const valeur = await this.commande('POST', '/element', { using: 'css selector', value: selecteur });

    return valeur[ELEMENT_KEY];
  }

  /** Un vrai toucher : c'est ce qui fait apparaître le clavier logiciel. */
  toucher(elementId) {
    return this.commande('POST', `/element/${elementId}/click`, {});
  }

  capture() {
    return this.commande('GET', '/screenshot');
  }

  fermer() {
    return this.commande('DELETE', '');
  }
}

async function appel(base, methode, chemin, corps) {
  const reponse = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: corps === undefined ? {} : { 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });

  const json = await reponse.json().catch(() => ({}));
  const valeur = json.value ?? json;

  if (!reponse.ok || valeur?.error) {
    throw new Error(
      `safaridriver ${methode} ${chemin} → ${reponse.status} ${valeur?.error ?? ''} : ${valeur?.message ?? ''}`,
    );
  }

  return chemin === '/session' ? { sessionId: json.value?.sessionId ?? json.sessionId, ...valeur } : valeur;
}
