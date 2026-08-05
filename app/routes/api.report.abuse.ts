import { Octokit } from '@octokit/rest';
import { data as json, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { FixedWindowRateLimiter } from '~/lib/fixed-window-rate-limiter';
import {
  getWebApiRoutesCopy,
  interpolateWebApiCopy,
  webApiErrorResponse,
  webApiLocaleHeaders,
  type WebApiRoutesCopy,
} from '~/lib/i18n/catalogs/web-api-routes';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

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

function abuseReportTypeLabel(type: AbuseReport['reportType'], copy: WebApiRoutesCopy): string {
  const keys = {
    code: 'abuseTypeCode',
    content: 'abuseTypeContent',
    harassment: 'abuseTypeHarassment',
    spam: 'abuseTypeSpam',
    copyright: 'abuseTypeCopyright',
    privacy: 'abuseTypePrivacy',
    other: 'abuseTypeOther',
  } as const;

  return copy[keys[type]];
}

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

function fallbackMailto(report: AbuseReport, copy: WebApiRoutesCopy) {
  const reportType = abuseReportTypeLabel(report.reportType, copy);
  const subject = interpolateWebApiCopy(copy.abuseMailSubject, { type: reportType });

  const body = [
    interpolateWebApiCopy(copy.abuseMailReportType, { type: reportType }),
    interpolateWebApiCopy(copy.abuseMailTargetUrl, { url: report.targetUrl }),
    report.username ? interpolateWebApiCopy(copy.abuseMailUsername, { username: report.username }) : undefined,
    report.reporterEmail
      ? interpolateWebApiCopy(copy.abuseMailReporterEmail, { email: report.reporterEmail })
      : undefined,
    report.pagePath ? interpolateWebApiCopy(copy.abuseMailPagePath, { path: report.pagePath }) : undefined,
    '',
    copy.abuseMailDescription,
    report.description,
  ]
    .filter(Boolean)
    .join('\n');

  return `mailto:abuse@e-code.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function issueBody(report: AbuseReport, request: Request, copy: WebApiRoutesCopy) {
  const reportType = abuseReportTypeLabel(report.reportType, copy);

  return [
    `**${copy.abuseIssueHeading}**`,
    '',
    `**${copy.abuseIssueType} :** ${sanitizeInput(reportType)}`,
    `**${copy.abuseIssueTargetUrl} :** ${sanitizeInput(report.targetUrl)}`,
    report.username ? `**${copy.abuseIssueUsername} :** ${sanitizeInput(report.username)}` : undefined,
    report.reporterEmail ? `**${copy.abuseIssueReporterEmail} :** ${sanitizeInput(report.reporterEmail)}` : undefined,
    report.pagePath ? `**${copy.abuseIssueSubmittedFrom} :** ${sanitizeInput(report.pagePath)}` : undefined,
    `**${copy.abuseIssueClientIp} :** ${sanitizeInput(getClientIP(request))}`,
    '',
    `**${copy.abuseIssueDescription} :**`,
    sanitizeInput(report.description),
    '',
    '---',
    `*${copy.abuseIssueFooter}*`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function action({ request, context }: ActionFunctionArgs) {
  const copy = getWebApiRoutesCopy(resolveRequestLocale(request).language);

  if (request.method !== 'POST') {
    return webApiErrorResponse(request, 'ABUSE_METHOD_NOT_ALLOWED', 405, { headers: { Allow: 'POST' } });
  }

  const clientIP = getClientIP(request);

  let report: AbuseReport;

  try {
    report = abuseReportSchema.parse(await readPayload(request));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return webApiErrorResponse(request, 'ABUSE_REPORT_INVALID', 400, {
        extra: {
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            code: issue.code,
          })),
        },
      });
    }

    return webApiErrorResponse(request, 'ABUSE_REQUEST_INVALID', 400);
  }

  if (isSpam(report)) {
    return webApiErrorResponse(request, 'ABUSE_REPORT_SPAM', 400);
  }

  /*
   * Only count valid, non-spam submissions against the per-IP limit. Recording
   * a hit for malformed or spam-flagged requests (which are rejected anyway)
   * would let an honest reporter exhaust their small hourly quota via repeated
   * client-side-skipped validation failures and get locked out for an hour.
   */
  if (!rateLimiter.check(clientIP)) {
    return webApiErrorResponse(request, 'ABUSE_RATE_LIMIT', 429);
  }

  const githubToken =
    envValue(context, 'ABUSE_REPORT_GITHUB_TOKEN') ||
    envValue(context, 'GITHUB_ABUSE_REPORT_TOKEN') ||
    envValue(context, 'GITHUB_BUG_REPORT_TOKEN');
  const targetRepo =
    envValue(context, 'ABUSE_REPORT_REPO') || envValue(context, 'BUG_REPORT_REPO') || 'openaxcloud/vibecore';

  if (!githubToken) {
    return webApiErrorResponse(request, 'ABUSE_INTAKE_UNAVAILABLE', 503, {
      extra: { fallbackMailto: fallbackMailto(report, copy) },
    });
  }

  const [owner, repo] = targetRepo.split('/');

  if (!owner || !repo) {
    return webApiErrorResponse(request, 'ABUSE_CONFIGURATION_INVALID', 500);
  }

  try {
    const octokit = new Octokit({
      auth: githubToken,
      userAgent: 'vibecore-abuse-reporter',
    });

    const titleUrl = report.targetUrl.length > 80 ? `${report.targetUrl.slice(0, 77)}...` : report.targetUrl;
    const reportType = abuseReportTypeLabel(report.reportType, copy);

    const issue = await octokit.rest.issues.create({
      owner,
      repo,
      title: interpolateWebApiCopy(copy.abuseIssueTitle, { type: reportType, url: titleUrl }),
      body: issueBody(report, request, copy),
      labels: ['abuse-report', 'trust-safety'],
    });

    return json(
      {
        success: true,
        issueNumber: issue.data.number,
        issueUrl: issue.data.html_url,
      },
      { headers: webApiLocaleHeaders(request) },
    );
  } catch (error) {
    console.error('Error creating abuse report:', error);

    return webApiErrorResponse(request, 'ABUSE_SUBMISSION_FAILED', 500);
  }
}
