import { data as json, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';

const MAX_LOGS_PER_BATCH = 100;
const MAX_BUFFERED_LOGS = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 120;

const frontendLogSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']),
  message: z.string().min(1).max(10_000),
  timestamp: z.string().datetime().optional().or(z.literal('')),
  source: z.string().max(120).optional(),
  category: z.enum(['error', 'action', 'navigation', 'performance', 'network']).optional(),
  url: z.string().max(4096).optional(),
  userAgent: z.string().max(1024).optional(),
  sessionId: z.string().max(160).optional(),
  userId: z.number().optional(),
  stack: z.string().max(20_000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const frontendLogBatchSchema = z.object({
  logs: z.array(frontendLogSchema).min(1).max(MAX_LOGS_PER_BATCH),
  sessionId: z.string().max(160).optional(),
  pageUrl: z.string().max(4096).optional(),
});

type FrontendLog = z.infer<typeof frontendLogSchema>;
type BufferedFrontendLog = FrontendLog & {
  receivedAt: string;
  clientIp: string;
  pageUrl?: string;
};

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
const recentFrontendLogs: BufferedFrontendLog[] = [];

function getClientIP(request: Request) {
  /*
   * x-real-ip is set by the ingress to the real peer (trustworthy). In
   * x-forwarded-for the RIGHTMOST entry is the one the trusted proxy appended;
   * the leftmost is client-spoofable. cf-connecting-ip is forgeable (no
   * Cloudflare in front of prod). See app/lib/security.ts getClientIP.
   */
  const realIP = request.headers.get('x-real-ip');

  if (realIP?.trim()) {
    return realIP.trim();
  }

  const parts =
    request.headers
      .get('x-forwarded-for')
      ?.split(',')
      .map((part) => part.trim())
      .filter(Boolean) ?? [];

  return parts.length > 0 ? parts[parts.length - 1] : 'unknown';
}

function checkRateLimit(ip: string) {
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || now > current.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  current.count += 1;

  return true;
}

async function readPayload(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    throw new Response(JSON.stringify({ error: 'Expected application/json' }), {
      status: 415,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return request.json();
}

function rememberLogs(logs: BufferedFrontendLog[]) {
  recentFrontendLogs.push(...logs);

  if (recentFrontendLogs.length > MAX_BUFFERED_LOGS) {
    recentFrontendLogs.splice(0, recentFrontendLogs.length - MAX_BUFFERED_LOGS);
  }
}

function writeServerLog(logs: BufferedFrontendLog[]) {
  const errors = logs.filter((log) => log.level === 'error');

  if (errors.length === 0) {
    return;
  }

  console.warn('[frontend-telemetry] received frontend errors', {
    count: errors.length,
    messages: errors.slice(0, 5).map((log) => log.message),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const clientIp = getClientIP(request);

  if (!checkRateLimit(clientIp)) {
    return json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let parsed: z.infer<typeof frontendLogBatchSchema>;

  try {
    parsed = frontendLogBatchSchema.parse(await readPayload(request));
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }

    if (error instanceof z.ZodError) {
      return json({ error: 'Invalid log format', details: error.errors }, { status: 400 });
    }

    return json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const receivedAt = new Date().toISOString();

  const bufferedLogs = parsed.logs.map((log) => ({
    ...log,
    sessionId: log.sessionId || parsed.sessionId,
    pageUrl: log.url || parsed.pageUrl,
    clientIp,
    receivedAt,
  }));

  rememberLogs(bufferedLogs);
  writeServerLog(bufferedLogs);

  return json({ success: true, processed: bufferedLogs.length, timestamp: receivedAt }, { status: 202 });
}

export const __testing = {
  recentFrontendLogs,
  rateLimitStore,
};
