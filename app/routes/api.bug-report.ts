import { Octokit } from '@octokit/rest';
import { data as json, type ActionFunctionArgs } from 'react-router';
import { z } from 'zod';
import { consumeRateLimit, isRateLimited, resolveBugReportConfig } from '~/lib/bug-report.server';
import { getApiRuntimeRoutesCopy, type ApiRuntimeRoutesCopy } from '~/lib/i18n/catalogs/api-runtime-routes';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

// Input validation schema
const bugReportSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().min(10).max(2000),
  stepsToReproduce: z.string().max(1000).optional(),
  expectedBehavior: z.string().max(1000).optional(),
  contactEmail: z.string().email().optional().or(z.literal('')),
  includeEnvironmentInfo: z.boolean().default(false),
  environmentInfo: z
    .object({
      browser: z.string().optional(),
      os: z.string().optional(),
      screenResolution: z.string().optional(),
      boltVersion: z.string().optional(),
      aiProviders: z.string().optional(),
      projectType: z.string().optional(),
      currentModel: z.string().optional(),
    })
    .optional(),
});

// Sanitize input to prevent XSS
function sanitizeInput(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

// Get client IP address
function getClientIP(request: Request): string {
  /*
   * Only trust headers the ingress actually sets. cf-connecting-ip and the
   * LEFTMOST x-forwarded-for entry are client-forgeable (no Cloudflare in prod),
   * so keying the rate limit on them let an attacker rotate the bucket and bypass
   * the limit. Use the nginx-set x-real-ip, then the RIGHTMOST (proxy-appended)
   * x-forwarded-for entry. (See app/lib/security.ts getClientIP.)
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

// Basic spam detection
function isSpam(title: string, description: string): boolean {
  const spamPatterns = [
    /\b(viagra|casino|poker|loan|debt|credit)\b/i,
    /\b(click here|buy now|limited time)\b/i,
    /\b(make money|work from home|earn \$\$)\b/i,
  ];

  const content = title + ' ' + description;

  return spamPatterns.some((pattern) => pattern.test(content));
}

// Format GitHub issue body
function formatIssueBody(data: z.infer<typeof bugReportSchema>, copy: ApiRuntimeRoutesCopy): string {
  let body = `**${copy['apiRuntime.bug.issue.heading']}**\n\n`;

  body += `**${copy['apiRuntime.bug.issue.description']} :**\n${data.description}\n\n`;

  if (data.stepsToReproduce) {
    body += `**${copy['apiRuntime.bug.issue.steps']} :**\n${data.stepsToReproduce}\n\n`;
  }

  if (data.expectedBehavior) {
    body += `**${copy['apiRuntime.bug.issue.expected']} :**\n${data.expectedBehavior}\n\n`;
  }

  if (data.includeEnvironmentInfo && data.environmentInfo) {
    body += `**${copy['apiRuntime.bug.issue.environment']} :**\n`;

    if (data.environmentInfo.browser) {
      body += `- ${copy['apiRuntime.bug.issue.browser']} : ${data.environmentInfo.browser}\n`;
    }

    if (data.environmentInfo.os) {
      body += `- ${copy['apiRuntime.bug.issue.os']} : ${data.environmentInfo.os}\n`;
    }

    if (data.environmentInfo.screenResolution) {
      body += `- ${copy['apiRuntime.bug.issue.screen']} : ${data.environmentInfo.screenResolution}\n`;
    }

    if (data.environmentInfo.boltVersion) {
      body += `- E-Code: ${data.environmentInfo.boltVersion}\n`;
    }

    if (data.environmentInfo.aiProviders) {
      body += `- ${copy['apiRuntime.bug.issue.aiProviders']} : ${data.environmentInfo.aiProviders}\n`;
    }

    if (data.environmentInfo.projectType) {
      body += `- ${copy['apiRuntime.bug.issue.projectType']} : ${data.environmentInfo.projectType}\n`;
    }

    if (data.environmentInfo.currentModel) {
      body += `- ${copy['apiRuntime.bug.issue.currentModel']} : ${data.environmentInfo.currentModel}\n`;
    }

    body += '\n';
  }

  if (data.contactEmail) {
    body += `**${copy['apiRuntime.bug.issue.contact']} :** ${data.contactEmail}\n\n`;
  }

  body += `---\n*${copy['apiRuntime.bug.issue.submitted']}*`;

  return body;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const copy = getApiRuntimeRoutesCopy(localeResolution.language);

  const localizedJson = (data: unknown, init?: Parameters<typeof json>[1]) => {
    const responseInit = typeof init === 'number' ? { status: init } : init;

    return json(data, { ...responseInit, headers: localeResponseHeaders(request, localeResolution) });
  };

  // Only allow POST requests
  if (request.method !== 'POST') {
    return localizedJson(
      { error: copy['apiRuntime.generic.methodNotAllowed'], code: 'METHOD_NOT_ALLOWED' },
      { status: 405 },
    );
  }

  try {
    /*
     * Rate limiting: only CHECK the quota here. We consume a token later, after
     * the submission has been fully validated and accepted, so that validation
     * failures, spam false-positives and accidental double-submits don't burn
     * an honest user's 5-per-hour allowance.
     */
    const clientIP = getClientIP(request);

    if (isRateLimited(clientIP)) {
      return localizedJson({ error: copy['apiRuntime.bug.rateLimit'], code: 'RATE_LIMITED' }, { status: 429 });
    }

    // Parse and validate request body
    const formData = await request.formData();
    const rawData: any = Object.fromEntries(formData.entries());

    // Parse environment info if provided
    if (rawData.environmentInfo && typeof rawData.environmentInfo === 'string') {
      try {
        rawData.environmentInfo = JSON.parse(rawData.environmentInfo);
      } catch {
        rawData.environmentInfo = undefined;
      }
    }

    // Convert boolean fields
    rawData.includeEnvironmentInfo = rawData.includeEnvironmentInfo === 'true';

    const validatedData = bugReportSchema.parse(rawData);

    // Sanitize text inputs
    const sanitizedData = {
      ...validatedData,
      title: sanitizeInput(validatedData.title),
      description: sanitizeInput(validatedData.description),
      stepsToReproduce: validatedData.stepsToReproduce ? sanitizeInput(validatedData.stepsToReproduce) : undefined,
      expectedBehavior: validatedData.expectedBehavior ? sanitizeInput(validatedData.expectedBehavior) : undefined,
    };

    // Spam detection
    if (isSpam(sanitizedData.title, sanitizedData.description)) {
      return localizedJson({ error: copy['apiRuntime.bug.spam'], code: 'POSSIBLE_SPAM' }, { status: 400 });
    }

    /*
     * Resolve GitHub config via globalThis.process.env (the Vite SSR polyfill
     * shims bare process.env to {} in the web pod) and fail closed when the
     * target repo is unset — never default to the upstream public repo.
     */
    const configResult = resolveBugReportConfig(context?.cloudflare?.env as Record<string, unknown> | undefined);

    if (!configResult.ok) {
      if (configResult.reason === 'token') {
        console.error('GitHub bug report token not configured');
        return localizedJson(
          { error: copy['apiRuntime.bug.notConfigured'], code: 'BUG_REPORT_NOT_CONFIGURED' },
          { status: 500 },
        );
      }

      console.error('GitHub bug report repository (BUG_REPORT_REPO) not configured or malformed');

      return localizedJson(
        { error: copy['apiRuntime.bug.notConfigured'], code: 'BUG_REPORT_NOT_CONFIGURED' },
        { status: 500 },
      );
    }

    const { githubToken, owner, repo } = configResult.config;

    // Initialize GitHub client
    const octokit = new Octokit({
      auth: githubToken,
      userAgent: 'e-code-bug-reporter',
    });

    // Consume one rate-limit token now that the report is validated and accepted.
    consumeRateLimit(clientIP);

    const issue = await octokit.rest.issues.create({
      owner,
      repo,
      title: sanitizedData.title,
      body: formatIssueBody(sanitizedData, copy),
      labels: ['bug', 'user-reported'],
    });

    return localizedJson({
      success: true,
      issueNumber: issue.data.number,
      issueUrl: issue.data.html_url,
      message: copy['apiRuntime.bug.success'],
    });
  } catch (error) {
    console.error('Error creating bug report:', error);

    // Handle validation errors
    if (error instanceof z.ZodError) {
      return localizedJson(
        {
          error: copy['apiRuntime.bug.invalidInput'],
          code: 'INVALID_INPUT',
          details: error.issues.map((issue) => ({ code: issue.code, path: issue.path })),
        },
        { status: 400 },
      );
    }

    // Handle GitHub API errors
    if (error && typeof error === 'object' && 'status' in error) {
      if (error.status === 401) {
        return localizedJson(
          { error: copy['apiRuntime.bug.githubAuthentication'], code: 'GITHUB_AUTHENTICATION_FAILED' },
          { status: 500 },
        );
      }

      if (error.status === 403) {
        return localizedJson(
          { error: copy['apiRuntime.bug.githubRateLimit'], code: 'GITHUB_RATE_LIMITED' },
          { status: 503 },
        );
      }

      if (error.status === 404) {
        return localizedJson(
          { error: copy['apiRuntime.bug.repositoryMissing'], code: 'BUG_REPORT_REPOSITORY_MISSING' },
          { status: 500 },
        );
      }
    }

    return localizedJson({ error: copy['apiRuntime.bug.failed'], code: 'BUG_REPORT_FAILED' }, { status: 500 });
  }
}
