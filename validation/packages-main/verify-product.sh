#!/usr/bin/env bash
set -euo pipefail
cd "${PRODUCT_DIR:?}"
[[ $(git rev-parse HEAD) == cd494729e00273d02e2c5a7e79eea1697824f1ca ]]
[[ $(git rev-parse HEAD^{tree}) == 06d294858b1dc77c5ff72130093bf43fdcf1878c ]]
git diff --exit-code HEAD --
[[ -z $(git ls-files --others --exclude-standard) ]]
python3 - <<'PY'
import subprocess,os,hashlib
for entry in subprocess.check_output(['git','ls-tree','-rz','HEAD']).split(b'\0'):
 if not entry: continue
 meta,path=entry.split(b'\t',1); mode,kind,expected=meta.split(); p=os.fsdecode(path)
 if kind!=b'blob': raise SystemExit('Unsupported tracked product entry')
 data=os.fsencode(os.readlink(p)) if mode==b'120000' else open(p,'rb').read()
 actual=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest().encode()
 if actual!=expected: raise SystemExit('Tracked product byte mismatch: '+p)
PY
