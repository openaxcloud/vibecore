#!/usr/bin/env python3
"""
TPL-02.6 / BUG-REMIX-001 — rejeu LIVE d'un remix Gallery portant des PII.

Aucune simulation : tout passe par l'API publique de l'environnement de test
(https://api.<LB>.sslip.io), avec de vraies sessions en base. On vérifie
ensuite les OCTETS RÉELLEMENT CLONÉS chez le remixeur.

Le défaut historique (BUG-REMIX-001) : le DERNIER groupe de l'IBAN restait en
clair. L'assertion est donc volontairement brutale — aucun fragment
significatif de l'IBAN source ne doit survivre dans le clone.
"""

import base64
import io
import json
import os
import sys
import time
import urllib.request
import urllib.error
import zipfile

API = os.environ["API"]
ACTORS = json.loads(os.environ["ACTORS"])
BY = {a["kind"]: a for a in ACTORS}


def call(method, path, token, body=None, expect=(200, 201)):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, method=method)
    req.add_header("authorization", f"Bearer {token}")
    req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            payload = json.loads(r.read() or b"{}")
            status = r.status
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw or b"{}")
        except Exception:
            payload = {"raw": raw[:500].decode("utf-8", "replace")}
        status = e.code
    if expect and status not in expect:
        print(f"!! {method} {path} -> {status}\n{json.dumps(payload, indent=2)[:1500]}")
        sys.exit(1)
    return status, payload


# --------------------------------------------------------------------------
# Charge utile PII. IBAN FR = 27 caractères (registre ISO 13616), présenté
# dans les DEUX formes qu'on rencontre en vrai : compacte et groupée par 4.
# --------------------------------------------------------------------------
IBAN_COMPACT = "FR7630006000011234567890189"
IBAN_SPACED = "FR76 3000 6000 0112 3456 7890 189"
EMAIL = "claire.dupont@exemple-client.fr"
PHONE = "+33 6 12 34 56 78"
CARD = "4111 1111 1111 1111"

PII_FILES = {
    "src/billing/customer.ts": (
        "// Fiche client de démonstration — données personnelles réalistes.\n"
        "export const customer = {\n"
        f"  email: '{EMAIL}',\n"
        f"  phone: '{PHONE}',\n"
        f"  iban: '{IBAN_COMPACT}',\n"
        f"  card: '{CARD}',\n"
        "};\n"
    ),
    "docs/mandat-sepa.md": (
        "# Mandat de prélèvement SEPA\n\n"
        f"Titulaire : Claire Dupont\n"
        f"IBAN : {IBAN_SPACED}\n"
        f"Contact : {EMAIL} / {PHONE}\n"
    ),
    "fixtures/payouts.json": json.dumps(
        {"payouts": [{"beneficiary": "Claire Dupont", "iban": IBAN_COMPACT, "amount": 1250}]},
        indent=2,
    )
    + "\n",
}

stamp = str(int(time.time()))
author, remixer, admin = BY["author"], BY["remixer"], BY["admin"]

print("== 1. projet source (auteur) ==")
_, proj = call(
    "POST",
    f"/orgs/{author['organizationId']}/projects",
    author["token"],
    {"name": f"TPL026 PII source {stamp}", "slug": f"tpl026-pii-{stamp}"},
)
pid = proj["project"]["id"] if "project" in proj else proj["id"]
print("   projet =", pid)

print("== 2. écriture des fichiers PII (import zip réel) ==")
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
    for path, content in PII_FILES.items():
        z.writestr(path, content)
_, imported = call(
    "POST",
    f"/projects/{pid}/files/import/zip",
    author["token"],
    {"zipBase64": base64.b64encode(buf.getvalue()).decode(), "replaceExisting": False},
)
print("   fichiers écrits =", len(imported.get("files", [])))

print("== 3. snapshot immuable ==")
_, snap = call("POST", f"/projects/{pid}/snapshots", author["token"], {"label": "tpl026-pii"})
sid = snap["snapshot"]["id"] if "snapshot" in snap else snap["id"]
print("   snapshot =", sid)

print("== 4. curation du listing (platform admin + step-up) ==")
slug = f"tpl026-pii-{stamp}"
_, listing = call(
    "POST",
    "/admin/gallery-listings",
    admin["token"],
    {
        "slug": slug,
        "title": "TPL026 PII source",
        "description": "Rejeu live du masquage PII au remix (BUG-REMIX-001).",
        "category": "internal-tools",
        "sourceProjectId": pid,
        "sourceSnapshotId": sid,
        "authorName": "TPL026 author",
        "authorUserId": author["userId"],
        "status": "PUBLISHED",
        "remixAllowed": True,
        "licenseId": "MIT",
        "licenseText": "MIT License\n\nPermission is hereby granted, free of charge...\n",
        "rightsConfirmed": True,
        "piiPolicyAccepted": True,
        # piiConsentVersion VOLONTAIREMENT absent : sans consentement auteur,
        # tout remix DOIT masquer.
    },
)
print("   listing =", slug)

print("== 5. remix par un AUTRE utilisateur ==")
status, remix = call(
    "POST",
    f"/gallery/{slug}/remix",
    remixer["token"],
    {"organizationId": remixer["organizationId"], "acceptLicense": True},
    expect=(201,),
)
clone_id = remix["project"]["id"]
print("   clone =", clone_id, "| piiMaskedCount =", remix["remix"].get("piiMaskedCount"))

print("== 6. relecture des OCTETS réels (export zip, pas de métadonnées) ==")


def read_bytes(project_id, token):
    """GET /export/zip renvoie l'archive en base64 : ce sont les VRAIS octets
    stockés, pas la vue `publicFiles` qui supprime le contenu."""
    _, res = call("GET", f"/projects/{project_id}/export/zip", token)
    raw = base64.b64decode(res["archive"]["base64"])
    out = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        for name in z.namelist():
            if name.endswith("/"):
                continue
            out[name] = z.read(name).decode("utf-8", "replace")
    return out


# CONTRÔLE POSITIF — sans lui, « aucune fuite » pourrait simplement vouloir
# dire que la fixture ne contenait aucune PII.
source_files = read_bytes(pid, author["token"])
source_blob = "\n".join(source_files.values())
control_ok = IBAN_COMPACT in source_blob and IBAN_SPACED in source_blob
print(f"   contrôle positif — IBAN en clair dans le SOURCE : {control_ok}")

if not control_ok:
    print("!! CONTRÔLE POSITIF ÉCHOUÉ : la fixture ne porte pas l'IBAN → test vacant, arrêt.")
    sys.exit(3)

files = read_bytes(clone_id, remixer["token"])
blob = "\n".join(files.values())

# Fragments qui NE DOIVENT PLUS exister. Le dernier groupe (`189`) est le
# défaut exact de BUG-REMIX-001 ; on teste aussi chaque groupe de 4 et la
# forme compacte, pour qu'aucune reconstruction ne soit possible.
groups = ["3000", "6000", "0112", "3456", "7890", "189", "890189", "7890189"]
fragments = [IBAN_COMPACT, IBAN_SPACED] + groups


def scan(corpus):
    found = []
    for frag in fragments:
        hits = [p for p, c in corpus.items() if frag in c]
        if hits:
            found.append((frag, hits))
    return found


# Le MÊME détecteur, appliqué au source : s'il ne trouvait rien ici non plus,
# l'absence de fuite dans le clone ne prouverait rien.
source_leaks = scan(source_files)
print(f"   détecteur appliqué au SOURCE : {len(source_leaks)}/{len(fragments)} fragments trouvés")
for frag, hits in source_leaks:
    print(f"     {frag!r} -> {hits}")

leaks = scan(files)

print()
print("   fichiers clonés :", len(files))
for p in sorted(files):
    print("    -", p)
print()
print("   --- contenu cloné de src/billing/customer.ts ---")
print(files.get("src/billing/customer.ts", "<ABSENT>"))
print("   --- contenu cloné de docs/mandat-sepa.md ---")
print(files.get("docs/mandat-sepa.md", "<ABSENT>"))
print("   --- contenu cloné de fixtures/payouts.json ---")
print(files.get("fixtures/payouts.json", "<ABSENT>"))

print()
if leaks:
    print("!! FUITE — fragments d'IBAN encore en clair :")
    for frag, hits in leaks:
        print(f"   {frag!r} dans {hits}")
    verdict = "FAIL"
else:
    print("OK — aucun fragment d'IBAN source ne survit dans le clone.")
    verdict = "PASS"

print(
    json.dumps(
        {
            "verdict": verdict,
            "sourceProjectId": pid,
            "snapshotId": sid,
            "listingSlug": slug,
            "cloneProjectId": clone_id,
            "piiMaskedCount": remix["remix"].get("piiMaskedCount"),
            "scrubbedValueLines": remix["remix"].get("scrubbedValueLines"),
            "clonedFileCount": len(files),
            "leaks": leaks,
            "emailStillClear": EMAIL in blob,
            "cardStillClear": CARD in blob,
        },
        indent=2,
    )
)
sys.exit(0 if verdict == "PASS" else 2)
