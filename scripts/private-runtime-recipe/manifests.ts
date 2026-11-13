/* eslint object-curly-newline: off -- Follow Prettier for nested literal objects; the repository rules conflict here. */
import { assertRecipeClusterName } from './checks.js';

export const dependencyImages = {
  postgres: 'pgvector/pgvector:pg16',
  redis: 'redis:7-alpine',
} as const;

/** Only local, generated credentials enter these manifests. Never log the result. */
export function recipeManifests(
  name: string,
  password: string,
  tokenSecret: string,
  managerSecret: string,
  jwtSecret: string,
) {
  assertRecipeClusterName(name);

  const metadata = (resource: string) => ({ name: resource, namespace: name, labels: { 'recipe.vibecore/id': name } });
  const env = (values: Record<string, string>) => Object.entries(values).map(([key, value]) => ({ name: key, value }));

  const pvc = (resource: string) => ({
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: metadata(resource),
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'standard',
      resources: { requests: { storage: '2Gi' } },
    },
  });
  const service = (resource: string, port: number) => ({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: metadata(resource),
    spec: {
      type: 'ClusterIP',
      selector: { app: resource },
      ports: [{ port, targetPort: port }],
    },
  });
  const deployment = (
    resource: string,
    image: string,
    port: number,
    options: {
      command?: string[];
      environment?: Record<string, string>;
      secret?: boolean;
      storage?: string;
      mountPath?: string;
      manager?: boolean;
      probePath?: string;
    } = {},
  ) => ({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: metadata(resource),
    spec: {
      replicas: 1,
      strategy: { type: 'Recreate' },
      selector: { matchLabels: { app: resource } },
      template: {
        metadata: { labels: { app: resource, 'recipe.vibecore/id': name } },
        spec: {
          serviceAccountName: options.manager ? 'manager' : 'default',
          automountServiceAccountToken: Boolean(options.manager),
          ...(image.includes('vc-private-platform:')
            ? { securityContext: { runAsUser: 1000, runAsGroup: 1000, fsGroup: 1000 } }
            : {}),
          containers: [
            {
              name: resource,
              image,
              imagePullPolicy: 'Never',
              ...(options.command ? { command: options.command } : {}),
              env: env(options.environment ?? {}),
              ...(options.secret ? { envFrom: [{ secretRef: { name: 'local-credentials' } }] } : {}),
              ports: [{ containerPort: port }],
              readinessProbe: options.probePath
                ? { httpGet: { path: options.probePath, port }, periodSeconds: 3, timeoutSeconds: 5 }
                : { tcpSocket: { port }, periodSeconds: 3 },
              resources: {
                requests: { cpu: '100m', memory: '128Mi' },
                limits: { memory: resource === 'api' ? '2Gi' : '1Gi' },
              },
              ...(options.storage ? { volumeMounts: [{ name: 'data', mountPath: options.mountPath }] } : {}),
            },
          ],
          ...(options.storage
            ? { volumes: [{ name: 'data', persistentVolumeClaim: { claimName: options.storage } }] }
            : {}),
        },
      },
    },
  });

  const platform = `vc-private-platform:${name}`;

  const common = {
    NODE_ENV: 'development',
    PRIVATE_RUNTIME_RECIPE_ID: name,
    WORKSPACE_RUNTIME_NAMESPACE: name,
    WORKSPACE_STORAGE_CLASS: 'standard',
    WORKSPACE_MANAGER_URL: 'http://manager:3010',
    WORKSPACE_AGENT_IMAGE: `vc-private-agent:${name}`,
    API_BASE_URL: 'http://api:3001',
    INTERNAL_API_BASE_URL: 'http://api:3001',
    REDIS_URL: 'redis://redis:6379',
    PROJECT_STORAGE_DIR: '/data/projects',
    SCHEDULED_TASKS_SCHEDULER: 'off',
  };

  return [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name, labels: { 'recipe.vibecore/id': name } } },
    {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: metadata('local-credentials'),
      type: 'Opaque',
      stringData: {
        DATABASE_URL: `postgresql://vibecore:${password}@postgres:5432/vibecore`,
        POSTGRES_PASSWORD: password,
        WORKSPACE_AGENT_TOKEN_SECRET: tokenSecret,
        WORKSPACE_MANAGER_SHARED_SECRET: managerSecret,
        JWT_SECRET: jwtSecret,
      },
    },
    { apiVersion: 'v1', kind: 'ServiceAccount', metadata: metadata('manager') },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: metadata('manager'),
      rules: [
        {
          apiGroups: [''],
          resources: ['pods', 'services', 'persistentvolumeclaims'],
          verbs: ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'],
        },
        { apiGroups: [''], resources: ['secrets'], verbs: ['get', 'create', 'update', 'patch', 'delete'] },
        { apiGroups: [''], resources: ['pods/log'], verbs: ['get'] },
      ],
    },
    {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: metadata('manager'),
      subjects: [{ kind: 'ServiceAccount', name: 'manager', namespace: name }],
      roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'manager' },
    },
    pvc('postgres'),
    pvc('project-storage'),
    service('postgres', 5432),
    deployment('postgres', dependencyImages.postgres, 5432, {
      secret: true,
      storage: 'postgres',
      mountPath: '/var/lib/postgresql/data',
      environment: { POSTGRES_USER: 'vibecore', POSTGRES_DB: 'vibecore', PGDATA: '/var/lib/postgresql/data/pgdata' },
    }),
    service('redis', 6379),
    deployment('redis', dependencyImages.redis, 6379),
    {
      apiVersion: 'batch/v1',
      kind: 'Job',
      metadata: metadata('migrate'),
      spec: {
        backoffLimit: 0,
        activeDeadlineSeconds: 600,
        template: {
          spec: {
            automountServiceAccountToken: false,
            restartPolicy: 'Never',
            containers: [
              {
                name: 'migrate',
                image: platform,
                imagePullPolicy: 'Never',
                command: [
                  'sh',
                  '-ec',
                  'pnpm --filter @vibecore/database db:deploy && pnpm --filter @vibecore/database db:seed',
                ],
                envFrom: [{ secretRef: { name: 'local-credentials' } }],
                env: env({ NODE_ENV: 'development' }),
              },
            ],
          },
        },
      },
    },
    service('manager', 3010),
    deployment('manager', platform, 3010, {
      command: ['pnpm', '--filter', '@vibecore/workspace-manager', 'exec', 'tsx', 'src/server.ts'],
      secret: true,
      manager: true,
      probePath: '/health',
      environment: {
        ...common,
        NODE_ENV: 'test',
        WORKSPACE_DISABLE_SANDBOX_SCHEDULING: '1',
        WORKSPACE_MANAGER_PORT: '3010',
      },
    }),
    service('api', 3001),
    deployment('api', platform, 3001, {
      command: ['pnpm', '--filter', '@vibecore/api', 'exec', 'tsx', 'src/server.ts'],
      secret: true,
      storage: 'project-storage',
      mountPath: '/data/projects',
      probePath: '/health',
      environment: { ...common, API_HOST: '0.0.0.0', API_PORT: '3001', RATE_LIMIT_FORCE_SHARED: '1' },
    }),
  ];
}
