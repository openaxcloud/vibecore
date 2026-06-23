import { Octokit } from '@octokit/rest';
import { data as json, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { FixedWindowRateLimiter } from '~/lib/fixed-window-rate-limiter';

const rateLimiter = new FixedWindowRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

const trimmedString = z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string());

const abuseReportSchema = z.object({
  reportType: z.enum(['code', 'content', 'harassment', 'spam', 'copyright', 'privacy', 'other']),
  targetUrl: trimmedString.pipe(z.string().url().max(2048)),
  description: trimmedString.pipe(z.string().min(20).max(5000)),
  reporterEmail: trimmedString.pipe(z.string().email().max(320)).optional().or(z.literal('')),
  username: trimmedString.pipe(z.string().max(100)).optional().or(z.literal('')),
  pagePath: trimmedString.pipe(z.string().max(200)).optional(),
});

type AbuseReport = z.infer<typeof abuseReportSchema>;

function sanitizeInput(input: string) {
  return input.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

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

function isSpam(report: AbuseReport) {
  const content = `${report.targetUrl} ${report.description} ${report.username ?? ''}`;

  const spamPatterns = [
    /\b(viagra|casino|poker|loan|crypto airdrop)\b/i,
    /\b(click here|buy now|limited time|work from home)\b/i,
    /(https?:\/\/[^\s]+.*){5,}/i,
  ];

  return spamPatterns.some((pattern) => pattern.test(content));
}

function envValue(context: ActionFunctionArgs['context'], key: string) {
  const cloudflareEnv = (context as unknown as { cloudflare?: { env?: Record<string, string | undefined> } })
    ?.cloudflare?.env;

  return cloudflareEnv?.[key] || process.env[key];
}

async function readPayload(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return request.json();
  }

  const formData = await request.formData();

  return Object.fromEntries(formData.entries());
}

function fallbackMailto(report: AbuseReport) {
  const subject = `E-Code abuse report: ${report.reportType}`;

  const body = [
    `Report type: ${report.reportType}`,
    `Target URL: ${report.targetUrl}`,
    report.username ? `Username: ${report.username}` : undefined,
    report.reporterEmail ? `Reporter email: ${report.reporterEmail}` : undefined,
    report.pagePath ? `Page path: ${report.pagePath}` : undefined,
    '',
    'Description:',
    report.description,
  ]
    .filter(Boolean)
    .join('\n');

  return `mailto:abuse@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function issueBody(report: AbuseReport, request: Request) {
  return [
    '**Abuse Report**',
    '',
    `**Type:** ${sanitizeInput(report.reportType)}`,
    `**Target URL:** ${sanitizeInput(report.targetUrl)}`,
    report.username ? `**Username:** ${sanitizeInput(report.username)}` : undefined,
    report.reporterEmail ? `**Reporter email:** ${sanitizeInput(report.reporterEmail)}` : undefined,
    report.pagePath ? `**Submitted from:** ${sanitizeInput(report.pagePath)}` : undefined,
    `**Client IP:** ${sanitizeInput(getClientIP(request))}`,
    '',
    '**Description:**',
    sanitizeInput(report.description),
    '',
    '---',
    '*Submitted via the public E-Code Report Abuse page.*',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  const clientIP = getClientIP(request);

  let report: AbuseReport;

  try {
    report = abuseReportSchema.parse(await readPayload(request));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: 'Invalid abuse report data', details: error.errors }, { status: 400 });
    }

    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (isSpam(report)) {
    return json(
      { error: 'Your report was flagged as potential spam. Please contact abuse@e-code.ai if this is an error.' },
      { status: 400 },
    );
  }

  /*
   * Only count valid, non-spam submissions against the per-IP limit. Recording
   * a hit for malformed or spam-flagged requests (which are rejected anyway)
   * would let an honest reporter exhaust their small hourly quota via repeated
   * client-side-skipped validation failures and get locked out for an hour.
   */
  if (!rateLimiter.check(clientIP)) {
    return json({ error: 'Rate limit exceeded. Please wait before submitting another report.' }, { status: 429 });
  }

  const githubToken =
    envValue(context, 'ABUSE_REPORT_GITHUB_TOKEN') ||
    envValue(context, 'GITHUB_ABUSE_REPORT_TOKEN') ||
    envValue(context, 'GITHUB_BUG_REPORT_TOKEN');
  const targetRepo =
    envValue(context, 'ABUSE_REPORT_REPO') || envValue(context, 'BUG_REPORT_REPO') || 'openaxcloud/vibecore';

  if (!githubToken) {
    return json(
      {
        error: 'Abuse report intake is not configured.',
        fallbackMailto: fallbackMailto(report),
      },
      { status: 503 },
    );
  }

  const [owner, repo] = targetRepo.split('/');

  if (!owner || !repo) {
    return json({ error: 'Abuse report repository is misconfigured. Expected "owner/repo" format.' }, { status: 500 });
  }

  try {
    const octokit = new Octokit({
      auth: githubToken,
      userAgent: 'vibecore-abuse-reporter',
    });

    const titleUrl = report.targetUrl.length > 80 ? `${report.targetUrl.slice(0, 77)}...` : report.targetUrl;

    const issue = await octokit.rest.issues.create({
      owner,
      repo,
      title: `[Abuse report] ${report.reportType}: ${titleUrl}`,
      body: issueBody(report, request),
      labels: ['abuse-report', 'trust-safety'],
    });

    return json({
      success: true,
      issueNumber: issue.data.number,
      issueUrl: issue.data.html_url,
    });
  } catch (error) {
    console.error('Error creating abuse report:', error);

    return json({ error: 'Failed to submit abuse report. Please try again later.' }, { status: 500 });
  }
}
