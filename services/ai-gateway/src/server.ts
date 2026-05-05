import { buildAiGatewayApp } from './app.js';

const app = buildAiGatewayApp();
const port = Number(process.env.AI_GATEWAY_PORT ?? 3030);

await app.listen({ host: '0.0.0.0', port });
