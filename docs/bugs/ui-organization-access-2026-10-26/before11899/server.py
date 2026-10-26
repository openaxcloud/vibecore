import subprocess,os,json,time
from pathlib import Path
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd='/workspace/vibecore-ui-safecontent',env={**os.environ,'PORT':'11899','HOST':'127.0.0.1','SAAS_API_URL':'http://127.0.0.1:6299','API_BASE_URL':'http://127.0.0.1:6299','NODE_ENV':'production'})
Path('/tmp/ui-org-access-next/server-origin.json').write_text(json.dumps({'pid':p.pid,'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':11899,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'cwd':'/workspace/vibecore-ui-safecontent','buildLabel':'codeUI975db321b/localbase52fd+mergemain; NOT plain main3eb','log':'/tmp/ui-org-access-next/server.log'}))
raise SystemExit(p.wait())
