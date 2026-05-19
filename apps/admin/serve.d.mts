import type { IncomingMessage, Server, ServerResponse } from 'node:http';

export interface AdminServerOptions {
  distDir: string;
  port?: number;
  host?: string;
}

export function createAdminHandler(options: {
  distDir: string;
}): (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function startAdminServer(options: AdminServerOptions): Promise<Server>;
