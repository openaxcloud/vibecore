/**
 * La vitrine et l'application sont deux ORIGINES distinctes : `e-code.ai`
 * (accueil, pages marketing) et `app.e-code.ai` (connexion, inscription, IDE).
 * `/login` et `/register` renvoient (301) de la première vers la seconde, et
 * rien de ce que le navigateur range par origine — `sessionStorage`,
 * `localStorage`, cookies sans domaine — ne franchit ce saut.
 *
 * Une seule règle pour tous ceux qui en dépendent : les 301 de `/login` et
 * `/register`, et le relais de l'idée tapée sur l'accueil
 * (BUG-QA0928-IDEE-PERDUE-INSCRIPTION).
 *
 * `e-code.localhost` suit la même règle : `*.localhost` résout vers 127.0.0.1
 * sans configuration, ce qui permet de reproduire en local le saut de domaine
 * de la production — et de tester le parcours depuis ses DEUX points d'entrée.
 */
export function origineDeLApplication(hote: string, protocole: string): string | null {
  const [nom, port] = hote.trim().toLowerCase().split(':');

  if (nom === 'e-code.ai' || nom === 'www.e-code.ai') {
    return 'https://app.e-code.ai';
  }

  if (nom === 'e-code.localhost' || nom === 'www.e-code.localhost') {
    return `${protocole}//app.e-code.localhost${port ? `:${port}` : ''}`;
  }

  return null;
}
