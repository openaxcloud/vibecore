# Crée le compte de TEST local (valeurs de compte-test.exemple.env) et un projet ; imprime l'id du projet.
# Refuse toute base qui n'est pas 127.0.0.1 : jamais la production.
import json, os, sys, urllib.request, urllib.error
api = 'http://127.0.0.1:3001'
def post(path, data, jeton=None):
    h = {'content-type': 'application/json'}
    if jeton: h['authorization'] = 'Bearer ' + jeton
    req = urllib.request.Request(api + path, json.dumps(data).encode(), h)
    try: return json.load(urllib.request.urlopen(req, timeout=30))
    except urllib.error.HTTPError as e: sys.exit(f'{path} -> HTTP {e.code} {e.read()[:200]!r}')
r = post('/auth/register', {'email': os.environ['BANC_COURRIEL'], 'password': os.environ['BANC_SECRET'],
                            'name': 'Banc iOS', 'organizationName': 'Banc iOS'})
p = post(f"/orgs/{r['organization']['id']}/projects", {'name': 'banc clavier'}, r['token'])
pid = p['project']['id']
# BANC_FIL=<n> : sème un fil de n tours (recette de tests/e2e/agent-message-density.spec.ts) — le fil de l'agent
# (pastille « descendre », pied du dernier message, bulle utilisateur) ne se juge pas sur un panneau vide.
n = int(os.environ.get('BANC_FIL', '0') or 0)
if n:
    def put(path, data):
        req = urllib.request.Request(api + path, json.dumps(data).encode(), {'content-type': 'application/json', 'authorization': 'Bearer ' + r['token']}, method='PUT')
        try: return json.load(urllib.request.urlopen(req, timeout=30))
        except urllib.error.HTTPError as e: sys.exit(f'{path} -> HTTP {e.code} {e.read()[:200]!r}')
    conv = post(f'/projects/{pid}/ai/conversations', {'title': 'Banc iOS'}, r['token'])['conversation']['id']
    paragraphe = "La page est créée, le formulaire valide l'adresse et `pnpm build` passe. " * 3
    msgs = []
    for t in range(1, n + 1):
        msgs.append({'clientId': f'u-{t}', 'role': 'user', 'content': f'Ajoute une page de contact (tour {t}).'})
        msgs.append({'clientId': f'a-{t}', 'role': 'assistant', 'content': f'Je vais ajouter la page (tour {t}).\n\n{paragraphe}\n\n{paragraphe}'})
    put(f'/projects/{pid}/ai/conversations/{conv}/transcript', {'messages': msgs})
    put(f'/projects/{pid}/ide-state', {'state': {'chat': {'metadata': {'aiConversationId': conv}}}})
print(pid)
