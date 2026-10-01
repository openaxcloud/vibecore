import { describe, expect, it } from 'vitest';

import { appPublicCopy, type AppPublicCopyKey } from '../app-public-copy.js';

/*
 * Un message d'erreur que le client ne comprend pas vaut à peine mieux qu'une
 * erreur serveur. Relevé en production le 2026-10-01 par la session livraisons :
 * « Une organisation portant ce nom ou ce slug existe déjà » — le mot « slug »
 * n'a aucun sens pour un client. Même relecture sur les messages qu'un client
 * peut lire (inscription, adresses, connexion par Google/GitHub, journaux de
 * publication) : « État OAuth invalide », « compilation dans le pod (cwd …) »,
 * « contexte gs://… », « ownerRepo doit être un slug… ».
 *
 * Les messages destinés aux ADMINISTRATEURS (configuration SSO/SCIM, secrets de
 * webhook) ou échangés entre serveurs gardent leur vocabulaire : il y est juste.
 */
const MESSAGES_LUS_PAR_UN_CLIENT: AppPublicCopyKey[] = [
  'ORGANIZATION_NAME_OR_SLUG_TAKEN',
  'PROJECT_SLUG_INVALID',
  'PROJECT_SLUG_TAKEN',
  'GALLERY_SLUG_TAKEN',
  'MCP_SLUG_FORMAT_INVALID',
  'SKILL_GITHUB_REPOSITORY_SLUG_INVALID',
  'SKILL_REPOSITORY_SLUG_INVALID',
  'OAUTH_TOKEN_MISSING',
  'OAUTH_EMAIL_UNVERIFIED',
  'OAUTH_PROFILE_INCOMPLETE',
  'OAUTH_STATE_INVALID',
  'OAUTH_RESOLVE_FAILED',
  'OAUTH_SESSION_FAILED',
  'OAUTH_STATE_USER_MISMATCH',
  'GITHUB_UPSTREAM_HTTP_ERROR',
  'CONNECTOR_UPSTREAM_HTTP_ERROR',
  'WORKSPACE_BUILD_DIRECTORY',
  'APP_IMAGE_BUILD_QUEUED',
  'DEPLOY_STOP_MANAGER_REFUSED',
  'DEPLOY_WORKSPACE_QUOTA',
  'DEPLOY_WORKSPACE_UNREACHABLE',
];

const JARGON =
  /\b(slug|token|jeton|payload|endpoint|OAuth|HTTP|upstream|pod|bucket|cwd|ownerRepo|callback|backend|manager|gestionnaire d’espaces)\b|gs:\/\//i;

describe('les messages qu’un client peut lire ne contiennent pas de vocabulaire de développeur', () => {
  it.each(MESSAGES_LUS_PAR_UN_CLIENT.flatMap((cle) => (['en', 'fr'] as const).map((langue) => [cle, langue] as const)))(
    '%s (%s)',
    (cle, langue) => {
      const texte = appPublicCopy(cle, langue, { provider: 'GitHub', value1: 'GitHub', value2: '403', status: '409' });

      expect(texte).not.toMatch(JARGON);
    },
  );

  it('le nom d’organisation déjà pris le dit simplement', () => {
    expect(appPublicCopy('ORGANIZATION_NAME_OR_SLUG_TAKEN', 'fr')).toBe('Ce nom est déjà utilisé. Choisissez-en un autre.');
  });
});
