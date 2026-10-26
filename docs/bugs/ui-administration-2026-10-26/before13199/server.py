import subprocess,os,json,time
from pathlib import Path
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd='/workspace/vibecore-ui-priority',env={**os.environ,'PORT':'13199','HOST':'127.0.0.1','SAAS_API_URL':'http://127.0.0.1:6699','API_BASE_URL':'http://127.0.0.1:6699','NODE_ENV':'production'})
Path('/tmp/ui-admin-next/server-origin.json').write_text(json.dumps({'pid':p.pid,'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':13199,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'cwd':'/workspace/vibecore-ui-priority','buildLabel':'priority common build read-only','log':'/tmp/ui-admin-next/server.log'}))
raise SystemExit(p.wait())
