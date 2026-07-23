#!/usr/bin/env python3
"""Régénère le chiffre normatif de disponibilité du drill failover DEPUIS
l'artefact brut GCP (uptime-raw-drill-window.json), sans transcription manuelle.

Source = uptime check GCP `api.e-code.ai/health`, 6 régions de sonde, fenêtre
EXACTE du drill (2026-07-21 07:55:00Z→08:00:00Z d'après les enregistrements
d'opérations Cloud SQL `gcloud-sql-operations.txt` : FAILOVER 07:55:41→07:56:13
puis 07:58:25→07:58:49). Autorité re-interrogeable : re-tirer le JSON via
  gcloud auth print-access-token + l'appel documenté dans README.md.

Usage: python3 regen-uptime-count.py [chemin.json]
"""
import json, sys

path = sys.argv[1] if len(sys.argv) > 1 else "uptime-raw-drill-window.json"
d = json.load(open(path))
if "error" in d:
    print("ERREUR API:", d["error"].get("message")); sys.exit(1)

true_pts = false_pts = 0
per_region = {}
for ts in d.get("timeSeries", []):
    region = ts.get("metric", {}).get("labels", {}).get("checker_location", "?")
    r = per_region.setdefault(region, [0, 0])
    for p in ts.get("points", []):
        if p["value"].get("boolValue"):
            true_pts += 1; r[0] += 1
        else:
            false_pts += 1; r[1] += 1

total = true_pts + false_pts
print(f"CHIFFRE NORMATIF RÉGÉNÉRÉ (source: {path})")
print(f"  fenêtre drill 07:55:00Z→08:00:00Z, {len(d.get('timeSeries', []))} régions de sonde GCP")
print(f"  points check_passed : True={true_pts}  False={false_pts}  total={total}")
print(f"  => disponibilité /health pendant le drill : {true_pts}/{total}")
for reg, (t, f) in sorted(per_region.items()):
    print(f"    {reg}: True={t} False={f}")
