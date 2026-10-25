const http = require('node:http');
http
  .createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    console.log(req.method, req.url);
    if (req.method !== 'GET') {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'Synthetic unavailable' }));
      return;
    }
    const user = {
      id: 'synthetic-ui',
      name: 'Camille Exemple',
      email: 'camille@example.test',
      timezone: 'Europe/Paris',
    };
    let data =
      req.url === '/auth/me'
        ? { user }
        : req.url === '/orgs'
          ? { organizations: [{ id: 'synthetic-org', name: 'Synthetic UI', role: 'OWNER' }] }
          : {};
    res.end(JSON.stringify(data));
  })
  .listen(3099, '127.0.0.1');
