#!/usr/bin/env python3
"""
TPL-02.3 — preuve LIVE du contrat d'aperçu par connecteur.

Ce que ça prouve, contre l'API réelle de l'environnement de test :
  1. le staging renvoie la liste des fichiers (chemin + taille) SANS leur contenu ;
  2. la relecture (GET) rejoue le même aperçu, recalcule les détections et
     n'avance PAS la machine à états ;
  3. le secret déposé n'apparaît NULLE PART dans l'aperçu (ni dans les
     détections, ni dans la liste de fichiers) ;
  4. commit sans décision → 409 (la porte tient) ;
  5. commit avec « redact » → projet créé, secret ABSENT des octets réels ;
  6. après commit, `preview` vaut null — « c'est terminé », pas « import vide ».

Contrôle de non-vacuité : on vérifie d'abord que le secret EST bien présent
dans ce qu'on a envoyé, sinon « aucune fuite » ne prouverait rien.
"""

import base64
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile

API = os.environ["API"]
ACTORS = json.loads(os.environ["ACTORS"])
ACTOR = {a["kind"]: a for a in ACTORS}["author"]

# Valeur de forme secrète, DÉRIVÉE à l'exécution et jamais écrite en dur : le
# dépôt est public et un littéral à forte entropie déclenche la porte gitleaks
# (constaté sur ce fichier même). Déterministe, donc le rejeu reste identique.
SECRET = hashlib.sha256(b"tpl023-import-preview-fixture").hexdigest()[:34]
ENV_CONTENT = f"PORT=3000\nAPI_SECRET={SECRET}\nDEBUG=true\n"
FILES = [
    {"path": "src/index.js", "content": 'console.log("hi")\n'},
    {"path": ".env", "content": ENV_CONTENT},
    {"path": "README.md", "content": "# Imported\n"},
]


def call(method, path, body=None, expect=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("authorization", f"Bearer {ACTOR['token']}")
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload, status = json.loads(r.read() or b"{}"), r.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {"raw": raw[:400].decode("utf-8", "replace")}
        status = e.code
    if expect is not None and status not in expect:
        print(f"!! {method} {path} -> {status}\n{json.dumps(payload, indent=2)[:1200]}")
        sys.exit(1)
    return status, payload


results = {}
org = ACTOR["organizationId"]
key = f"tpl023-{int(time.time())}"

print("== contrôle de non-vacuité : le secret est bien dans ce qu'on envoie ==")
sent = json.dumps(FILES)
assert SECRET in sent, "fixture sans secret → test vacant"
print("   OK — secret présent dans la charge envoyée")

print("== 1. staging (POST /orgs/:orgId/imports) ==")
status, staged = call(
    "POST", f"/orgs/{org}/imports", {"idempotencyKey": key, "provider": "github", "files": FILES}, expect=(202,)
)
imp = staged["import"]
job_id = imp["importJobId"]
print(f"   {status} state={imp['state']} requiresConsent={imp['requiresConsent']}")

staged_files = imp.get("stagedFiles")
results["stagedFilesPresent"] = staged_files is not None
print(f"   stagedFiles = {json.dumps(staged_files)}")

# (1) chemins + tailles, (3) aucun contenu, aucun secret
results["pathsSorted"] = [f["path"] for f in staged_files] == [".env", "README.md", "src/index.js"]
results["envSizeExact"] = any(
    f["path"] == ".env" and f["sizeBytes"] == len(ENV_CONTENT.encode()) for f in staged_files
)
results["noSecretInStaging"] = SECRET not in json.dumps(imp)
results["noContentInStaging"] = "console.log" not in json.dumps(staged_files)

print("== 2. relecture (GET) — même aperçu, lecture seule, TOUS réplicas ==")

# BUG-IMPORT-001 : avec le staging en mémoire du processus, ces lectures
# alternaient aperçu / vide au gré du load balancer. On en fait assez pour
# toucher les deux pods.
previews = []

for _ in range(8):
    _, probe = call("GET", f"/orgs/{org}/imports/{job_id}", expect=(200,))
    previews.append("preview" if probe["import"].get("preview") else "NULL")

print(f"   8 lectures consécutives -> {previews}")
results["everyReplicaSeesPreview"] = all(p == "preview" for p in previews)

_, read1 = call("GET", f"/orgs/{org}/imports/{job_id}", expect=(200,))
_, read2 = call("GET", f"/orgs/{org}/imports/{job_id}", expect=(200,))
p1, p2 = read1["import"].get("preview"), read2["import"].get("preview")
results["previewOnRead"] = p1 is not None
results["readIsStable"] = p1 == p2
results["readDoesNotAdvanceState"] = read1["import"]["state"] == read2["import"]["state"] == imp["state"]
results["findingsRecomputed"] = len(p1["findings"]) > 0 and p1["requiresConsent"] is True
results["noSecretInRead"] = SECRET not in json.dumps(read1)
print(f"   state={read1['import']['state']} findings={len(p1['findings'])} preview stable={results['readIsStable']}")

print("== 3. la porte tient : commit SANS décision ==")
status, blocked = call("POST", f"/orgs/{org}/imports/{job_id}/commit", {"consent": {}})
results["commitBlockedWithoutConsent"] = status == 409
print(f"   {status} code={blocked.get('code')}")

print("== 4. commit AVEC décision « redact » ==")
consent = {f"{f['path']}:{f['line']}": "redact" for f in p1["findings"]}
print(f"   consent = {json.dumps(consent)}")
status, committed = call("POST", f"/orgs/{org}/imports/{job_id}/commit", {"consent": consent}, expect=(201,))
project_id = committed["project"]["id"]
print(f"   {status} projet={project_id} redacted={committed['import'].get('redactedCount')}")

print("== 5. octets réels du projet créé ==")
_, exported = call("GET", f"/projects/{project_id}/export/zip", expect=(200,))
raw = base64.b64decode(exported["archive"]["base64"])
contents = {}
with zipfile.ZipFile(io.BytesIO(raw)) as z:
    for n in z.namelist():
        if not n.endswith("/"):
            contents[n] = z.read(n).decode("utf-8", "replace")
blob = "\n".join(contents.values())
results["secretAbsentFromProject"] = SECRET not in blob
results["envFilePresent"] = ".env" in contents
print(f"   fichiers = {sorted(contents)}")
print(f"   .env après masquage :\n{contents.get('.env', '<ABSENT>')}")

print("== 6. après commit : preview null ET réservation SETTLED ==")
_, after = call("GET", f"/orgs/{org}/imports/{job_id}", expect=(200,))
results["previewNullAfterCommit"] = after["import"].get("preview") is None
reservation = after["import"].get("reservation") or {}
results["reservationSettled"] = reservation.get("state") == "SETTLED"
results["debitOnlyAfterCommit"] = (reservation.get("debitedCredits") or 0) > 0
print(f"   preview={after['import'].get('preview')} state={after['import']['state']} reservation={reservation}")

print()
failed = [k for k, v in results.items() if not v]
print(json.dumps({"verdict": "PASS" if not failed else "FAIL", "checks": results, "failed": failed}, indent=2))
sys.exit(0 if not failed else 2)
