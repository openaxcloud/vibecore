import { buildApiApp } from '../../../services/api/src/app.ts';
import { TestApiStore } from '../../../services/api/src/tests/test-api-store.ts';
import { GitCliProvider } from '../../../services/api/src/project-storage.ts';

const provider = new GitCliProvider({
  resolveHost: async (host) => (host === 'forge.example.invalid' ? ['93.184.216.34'] : []),
});
// The parent retains only the synthetic database rows across API lifetimes.
// Git objects, the worktree and configuration are read from PROJECT_STORAGE_DIR.
const tables = ['users', 'sessions', 'memberships', 'organizations', 'projects', 'workspaces', 'snapshots'];
const store = new TestApiStore();
const initial = await new Promise((resolve) => process.once('message', resolve));
for (const key of tables) for (const [id, value] of initial[key] || []) store[key].set(id, value);
const app = await buildApiApp({ gitProvider: provider, store, emailProvider: { async send() {} } });
await app.listen({ host: '127.0.0.1', port: Number(new URL(process.env.QA_API).port) });

process.send('ready');
process.once('message', async () => {
  await app.close();
  process.send(Object.fromEntries(tables.map((key) => [key, [...store[key]]])), () => process.disconnect());
});
