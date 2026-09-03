/**
 * `@e-code/sdk` — the public SDK that apps generated on VibeCore/E-Code import to
 * reach the platform capabilities the workspace injects, with Replit-style
 * ergonomics. Today: Object Storage (a real GCS-backed bucket per project),
 * Database (the injected Postgres URL), and Secrets/Env.
 *
 * The workspace injects, at pod start:
 *   - OBJECT_STORAGE_API_URL, OBJECT_STORAGE_ACCESS_TOKEN, PROJECT_ID  (object storage)
 *   - DATABASE_URL / PROD_DATABASE_URL                                  (database)
 *   - every project secret/env var                                     (secrets)
 */

export {
  ObjectStorageClient,
  ObjectStorageError,
  type ObjectStorageClientOptions,
  type StoredObject,
  type ListObjectsResult,
  type UploadUrl,
  type DownloadUrl,
} from './object-storage.js';

export {
  LEGACY_OBJECT_STORAGE_SCOPES,
  objectStorageTokenScopes,
  signObjectStorageAccessToken,
  verifyObjectStorageAccessToken,
  type ObjectStorageAccessTokenPayload,
  type ObjectStorageScope,
  type VerifyObjectStorageAccessTokenResult,
} from './token.js';

import { ObjectStorageClient, type ObjectStorageClientOptions } from './object-storage.js';

function envOf(name: string): string | undefined {
  return typeof process !== 'undefined' ? process.env?.[name] : undefined;
}

/** The Postgres connection URL injected by the workspace, per environment. */
export function getDatabaseUrl(environment: 'development' | 'production' = 'development'): string | undefined {
  return environment === 'production'
    ? envOf('PROD_DATABASE_URL') ?? envOf('DATABASE_URL')
    : envOf('DATABASE_URL');
}

/** Read a project secret/env var the workspace injected. */
export function getSecret(name: string): string | undefined {
  return envOf(name);
}

/**
 * A single unified entry point (Replit-style): `const client = new Client()`
 * then `client.objectStorage.listObjects()`, `client.database.url`,
 * `client.secrets.get('STRIPE_KEY')`.
 */
export class Client {
  readonly objectStorage: ObjectStorageClient;
  readonly database: { url: string | undefined; productionUrl: string | undefined };
  readonly secrets: { get(name: string): string | undefined };

  constructor(options: { objectStorage?: ObjectStorageClientOptions } = {}) {
    this.objectStorage = new ObjectStorageClient(options.objectStorage);
    this.database = { url: getDatabaseUrl('development'), productionUrl: getDatabaseUrl('production') };
    this.secrets = { get: getSecret };
  }
}
