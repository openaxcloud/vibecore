import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const importedEcodeRoutes = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/runtime-test',
  '/',
  '/pricing',
  '/features',
  '/about',
  '/careers',
  '/blog',
  '/blog/:slug',
  '/docs',
  '/contact-sales',
  '/terms',
  '/privacy',
  '/dpa',
  '/commercial-agreement',
  '/report-abuse',
  '/status',
  '/forum',
  '/compare/:slug',
  '/marketing/bounties',
  '/marketing/deployments',
  '/marketing/teams',
  '/compare',
  '/compare/github-codespaces',
  '/compare/glitch',
  '/compare/heroku',
  '/compare/codesandbox',
  '/compare/aws-cloud9',
  '/solutions/app-builder',
  '/solutions/website-builder',
  '/solutions/game-builder',
  '/solutions/dashboard-builder',
  '/solutions/chatbot-builder',
  '/solutions/internal-ai-builder',
  '/solutions/enterprise',
  '/solutions/startups',
  '/solutions/freelancers',
  '/tutorials',
  '/changelog',
  '/case-studies',
  '/help-center',
  '/contact',
  '/accessibility',
  '/mobile',
  '/mobile-workspace/:projectId',
  '/ai',
  '/ai-documentation',
  '/mcp',
  '/polyglot',
  '/demo',
  '/theme-validation',
  '/press',
  '/partners',
  '/security',
  '/desktop',
  '/subprocessors',
  '/student-dpa',
  '/languages',
  '/templates/languages',
  '/team',
  '/collaboration',
  '/deployments',
  '/newsletter-confirmed',
  '/newsletter/confirm',
  '/newsletter/unsubscribe',
  '/share/:shareId',
  '/u/:username/:projectname',
  '/u/:username',
  '/ide/new',
  '/ide/:id',
  '/marketplace',
  '/marketplace/templates',
  '/templates',
  '/community',
  '/community/post/:id',
  '/search',
  '/explore',
  '/ai-agent/studio',
  '/github-import',
  '/projects/:id/import/figma',
  '/projects/:id/import/bolt',
  '/projects/:id/import/lovable',
  '/new',
  '/editor/new',
  '/projects/new',
  '/dashboard',
  '/agent-activity',
  '/apps',
  '/teams',
  '/teams/new',
  '/teams/:id',
  '/teams/:id/settings',
  '/vnc',
  '/notifications',
  '/analytics',
  '/scalability',
  '/education',
  '/api-sdk',
  '/mobile-apps',
  '/advanced/mobile',
  '/advanced/sso',
  '/advanced/collaboration',
  '/advanced/storage',
  '/advanced/community',
  '/settings',
  '/settings/notifications',
  '/settings/billing',
  '/profile/:username?',
  '/home',
  '/projects',
  '/projects/:id',
  '/project/:id',
  '/editor/:id',
  '/runtimes',
  '/runtime-diagnostics',
  '/user/:username',
  '/user/settings',
  '/search-advanced',
  '/secrets',
  '/workflows',
  '/ssh',
  '/security-scanner',
  '/dependencies',
  '/object-storage',
  '/projects/:id/database',
  '/projects/:id/secrets',
  '/usage-alerts',
  '/projects/:id/preview',
  '/mobile-admin',
  '/admin',
  '/admin/dashboard',
  '/admin/usage',
  '/admin/ai-usage',
  '/admin/requests',
  '/admin/billing',
  '/admin/ai-models',
  '/admin/ai-optimization',
  '/admin/seo',
  '/admin/monitoring',
  '/admin/system-monitoring',
  '/admin/pitch-deck',
  '/admin/chatgpt',
  '/admin/users',
  '/admin/projects',
  '/admin/subscriptions',
  '/admin/activity',
  '/admin/settings',
  '/admin/api-keys',
  '/admin/support',
  '/admin/cms',
  '/admin/docs',
  '/account',
  '/usage',
  '/billing',
  '/cycles',
  '/bounties',
  '/powerups',
  '/badges',
  '/subscribe',
  '/plans',
  '/learn',
  '/support',
  '/themes',
  '/health',
  '/performance',
  '/sso-configuration',
  '/audit-logs',
  '/custom-roles',
  '/assistant',
  '/code-search',
  '/problems',
  '/database',
  '/console',
  '/shell',
  '/packages',
  '/kv-store',
  '/preview',
  '/authentication',
  '/extensions',
  '/integrations',
  '/networking',
  '/threads',
  '/referrals',
  '/u/admin/solartech-ai-chat',
  '/u/admin/solartech-crm',
  '/u/admin/solartech-fortune500-store',
  '/solartech-ai-chat',
  '/solartech-crm',
  '/salesforcepro-crm',
  '/solartech-fortune500-store',
] as const;

describe('E-Code route import coverage', () => {
  it('keeps every route from the E-Code route config backed by a Remix route file', () => {
    const remixPatterns = readdirSync(join(process.cwd(), 'app/routes')).flatMap(routeFileToPatterns);

    const missingRoutes = importedEcodeRoutes.flatMap(expandOptionalRoute).filter((route) => {
      return !remixPatterns.some((pattern) => routeMatches(pattern, route));
    });

    expect(missingRoutes).toEqual([]);
  });
});

function routeFileToPatterns(file: string): string[] {
  if (!/\.(tsx|ts)$/.test(file) || file.startsWith('api.')) {
    return [];
  }

  const base = file.replace(/\.(tsx|ts)$/, '');

  if (base === '_index') {
    return ['/'];
  }

  const routeSegments = base
    .split('.')
    .filter((segment) => segment !== '_index')
    .map((segment) => {
      if (segment === '$') {
        return '*';
      }

      if (segment.startsWith('$')) {
        return `:${segment.slice(1)}`;
      }

      return segment.replace(/_/g, '-');
    });

  return [`/${routeSegments.join('/')}`];
}

function expandOptionalRoute(route: string): string[] {
  if (!route.includes('?')) {
    return [route];
  }

  return [route.replace(/\/:[^/]+\?/g, ''), route.replace(/\?/g, '')];
}

function routeMatches(pattern: string, route: string): boolean {
  if (pattern === route) {
    return true;
  }

  const patternSegments = splitRoute(pattern);
  const routeSegments = splitRoute(route);

  if (patternSegments.length !== routeSegments.length) {
    return false;
  }

  return patternSegments.every((segment, index) => {
    return segment === '*' || segment.startsWith(':') || segment === routeSegments[index];
  });
}

function splitRoute(route: string): string[] {
  return route.replace(/^\//, '').split('/').filter(Boolean);
}
