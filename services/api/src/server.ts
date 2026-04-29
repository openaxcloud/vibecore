import { buildApiApp } from './app.js';
import { startOpenTelemetry } from './telemetry.js';

startOpenTelemetry();

const app = await buildApiApp();
const port = Number(process.env.API_PORT ?? 3001);
const host = process.env.API_HOST ?? '0.0.0.0';

await app.listen({ port, host });
