const http = require('node:http');
const port = Number(process.env.FIXTURE_PORT || 8199);
const org = { id: 'synthetic-org', name: 'Synthetic UI evidence only', role: 'OWNER' };
http
  .createServer((req, res) => {
    const p = new URL(req.url, 'http://127.0.0.1').pathname;
    console.log(req.method, p);
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'GET') {
      res.statusCode = 503;
      return res.end(JSON.stringify({ error: 'Synthetic fixture blocks mutations' }));
    }
    let value;
    if (p === '/auth/me')
      value = { user: { id: 'synthetic-user', name: 'Synthetic User', email: 'ui@example.test', timezone: 'UTC' } };
    else if (p === '/orgs') value = { organizations: [org] };
    else if (p === '/orgs/synthetic-org/credits')
      value = {
        creditsEnabled: true,
        balanceCents: 10000,
        totalAvailableCents: 10000,
        blockExternalAi: false,
        activePacks: [],
        ledger: [],
        packCatalog: [],
      };
    else if (p === '/orgs/synthetic-org/billing')
      value = {
        plan: { key: 'pro', name: 'Synthetic Pro' },
        subscription: { status: 'active' },
        usage: [],
        upgradePrompts: [],
      };
    else if (/^\/projects\/synthetic-(first|second)$/.test(p)) {
      const id = p.split('/').pop();
      value = { project: { id, name: 'Synthetic project ' + id, organizationId: org.id, status: 'active' } };
    } else if (/^\/projects\/synthetic-(first|second)\/dashboard$/.test(p))
      value = { workspace: null, git: { branch: 'main', changedFiles: [], ahead: 0, behind: 0 }, recentActivity: [] };
    else if (p.endsWith('/workspaces')) value = { workspaces: [] };
    else if (p.endsWith('/collaborators')) value = { collaborators: [] };
    else if (p.endsWith('/ai/conversations')) value = { conversations: [] };
    else if (p.endsWith('/snapshots')) value = { snapshots: [] };
    else if (p === '/user/preferences') value = { preferences: {} };
    else if (p === '/user/notifications') value = { notifications: [] };
    else {
      res.statusCode = 404;
      value = { error: 'Unconfigured synthetic GET', path: p };
    }
    res.end(JSON.stringify(value));
  })
  .listen(port, '127.0.0.1');
