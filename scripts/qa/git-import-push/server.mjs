import { buildApiApp } from '../../../services/api/src/app.ts';
import { TestApiStore } from '../../../services/api/src/tests/test-api-store.ts';
import { GitCliProvider } from '../../../services/api/src/project-storage.ts';

const provider = new GitCliProvider({
  resolveHost: async (host) => (host === 'forge.example.invalid' ? ['93.184.216.34'] : []),
});
const app = await buildApiApp({ gitProvider: provider, store: new TestApiStore(), emailProvider: { async send() {} } });
await app.listen({ host: '127.0.0.1', port: Number(new URL(process.env.QA_API).port) });
