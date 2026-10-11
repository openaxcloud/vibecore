#!/usr/bin/env python3
"""Preuve de production, lecture seule — BUG-QA0928-RUNTIME-ID-PROJET.

Usage :
  C=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
  for p in $(kubectl --context $C -n vibecore get pods -l app.kubernetes.io/component=api -o name); do
    kubectl --context $C -n vibecore logs $p -c api --since=24h; done | python3 preuve-journaux-runtime.py

Rejoint chaque réponse à sa requête par reqId (Fastify journalise route et statut sur deux lignes),
classe les appels /api/runtime/workspaces/<id> selon que <id> est un `ws-…` (workspace) ou un cuid
de PROJET, et sort les compteurs par minute. Aucun en-tête, aucune adresse, aucun corps n'est imprimé ;
les identifiants de projet sont remplacés par une empreinte courte.
"""
import sys, json, re, collections, datetime, hashlib

req, projets = {}, set()
parmin = collections.Counter()
for ligne in sys.stdin:
    try:
        j = json.loads(ligne)
    except ValueError:
        continue
    q = j.get('req') or {}
    if q.get('url'):
        chemin = q['url'].split('?')[0]
        req[j.get('reqId')] = (q.get('method'), chemin)
        for m in re.finditer(r'/projects/(c[a-z0-9]{20,})', chemin):
            projets.add(m.group(1))
    sc = (j.get('res') or {}).get('statusCode')
    if not sc or j.get('reqId') not in req:
        continue
    meth, chemin = req[j['reqId']]
    if meth == 'OPTIONS':
        continue
    minute = datetime.datetime.utcfromtimestamp(j['time'] / 1000).strftime('%H:%M')
    w = re.match(r'/api/runtime/workspaces/([^/]+)(/.*)?$', chemin)
    if chemin == '/auth/runtime-ticket':
        parmin[(minute, 'ticket', sc)] += 1
    elif chemin == '/api/runtime/workspaces' and meth == 'POST':
        parmin[(minute, 'démarrage workspace', sc)] += 1
    elif w:
        genre = 'ws-…' if w.group(1).startswith('ws-') else ('ID DE PROJET' if w.group(1) in projets else 'autre cuid')
        parmin[(minute, f'runtime sur {genre} {meth} {w.group(2) or "/"}', sc)] += 1

tot = collections.Counter()
for (minute, quoi, sc), n in sorted(parmin.items()):
    if 'ID DE PROJET' in quoi or quoi.startswith('ticket') or quoi.startswith('démarrage'):
        print(f'{minute}  {sc}  {quoi}  ×{n}')
    tot[(quoi.split(' ')[0] + ' ' + ' '.join(quoi.split(' ')[1:4]), sc)] += n
print('\n== TOTAUX')
for k, n in sorted(tot.items(), key=lambda x: -x[1])[:15]:
    print(n, k)
print('VERDICT appels runtime sur ID DE PROJET :', sum(n for (m, q, s), n in parmin.items() if 'ID DE PROJET' in q),
      '— dont refusés 401 :', sum(n for (m, q, s), n in parmin.items() if 'ID DE PROJET' in q and s == 401),
      '— écritures de fichiers refusées :', sum(n for (m, q, s), n in parmin.items() if 'ID DE PROJET' in q and 'files/write' in q and s == 401))
