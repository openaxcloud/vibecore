#!/usr/bin/env python3
"""Rejoue la fouille PII du clone prod: export zip -> decode -> cherche la PII de la source.

  python3 scan-clone-for-pii.py <CLONE_PROJECT_ID> <BEARER_TOKEN>

Sort 1 si une PII de la source est retrouvee dans le clone (le test DOIT echouer a la trouver).
"""
import json, re, sys, urllib.request, base64, zipfile, io, hashlib

SOURCE_PII = ["4242 4242 4242 4242", "4242-4242-4242-4242", "4242424242424242"]

def luhn(s):
    d = [int(c) for c in s][::-1]; t = 0
    for i, c in enumerate(d):
        if i % 2:
            c *= 2; c = c - 9 if c > 9 else c
        t += c
    return t % 10 == 0

pid, token = sys.argv[1], sys.argv[2]
req = urllib.request.Request(f"https://api.e-code.ai/projects/{pid}/export/zip",
                             headers={"authorization": f"Bearer {token}"})
raw = base64.b64decode(json.load(urllib.request.urlopen(req))["archive"]["base64"])
z = zipfile.ZipFile(io.BytesIO(raw))
blob = {}
for n in z.namelist():
    try: blob[n] = z.read(n).decode("utf-8", "ignore")
    except Exception: pass
joined = "\n".join(blob.values())
norm = re.sub(r"[ \-]", "", joined)

print("zip sha256      :", hashlib.sha256(raw).hexdigest())
print("files / bytes   :", len(blob), "/", len(joined))
assert len(joined) > 0, "NON-VACUITE: archive vide -> la fouille ne prouverait rien"
markers = joined.count("[PII:")
print("mask markers    :", markers)
assert markers > 0, "NON-VACUITE: aucun marqueur de masquage"

found = [v for v in SOURCE_PII if v in joined] + (["<normalise>"] if "4242424242424242" in norm else [])
luhns = sorted({c for c in re.findall(r"(?<!\d)\d{16}(?!\d)", norm) if luhn(c)})
print("source PII found:", found or "ABSENT")
print("luhn-valid 16d  :", luhns or "NONE")
sys.exit(1 if (found or luhns) else 0)
