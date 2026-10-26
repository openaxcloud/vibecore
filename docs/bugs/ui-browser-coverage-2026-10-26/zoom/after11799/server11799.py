import subprocess,os,json,time
from pathlib import Path
port=11799
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd='/workspace/vibecore-ui-safecontent',env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','SAAS_API_URL':'http://127.0.0.1:6099','NODE_ENV':'production'})
Path('/tmp/ui-browser-zoom-next/server11799-origin.json').write_text(json.dumps({'pid':p.pid,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':port,'log':'/tmp/ui-browser-zoom-next/server11799.log'}))
raise SystemExit(p.wait())
