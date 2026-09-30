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
print(p['project']['id'])
