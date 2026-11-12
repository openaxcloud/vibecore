#!/usr/bin/env bash
set -euo pipefail
cd "${PRODUCT_DIR:?}"
[[ $(git rev-parse HEAD) == 05515deb61d2ff7a77c11243cb0d1bed58a08e69 ]]
[[ $(git rev-parse HEAD^{tree}) == e3d7f51ea4c250e686cfb560876da9c25ebab899 ]]
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
