import subprocess,os,json,time
from pathlib import Path
port=12499
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd='/workspace/vibecore-ui-legal-next',env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','SAAS_API_URL':'http://127.0.0.1:6199','NODE_ENV':'production'})
Path('/tmp/ui-legal-p2-static/after12499/server-origin.json').write_text(json.dumps({'pid':p.pid,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':port,'log':'/tmp/ui-legal-p2-static/after12499/server.log'}))
raise SystemExit(p.wait())
