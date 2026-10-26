import subprocess,os,json,time
from pathlib import Path
D=Path('/tmp/ui-entry-next')
api=subprocess.Popen(['node',str(D/'fixture.cjs')],stdout=open(D/'api.log','w'),stderr=subprocess.STDOUT)
env={k:v for k,v in os.environ.items() if k not in ['DATABASE_URL','REDIS_URL','SAAS_API_URL','API_BASE_URL','NODE_OPTIONS']};env.update(PORT='12399',HOST='127.0.0.1',SAAS_API_URL='http://127.0.0.1:6499',API_BASE_URL='http://127.0.0.1:6499',NODE_ENV='production',NODE_OPTIONS='--require=/tmp/ui-entry-next/fetch-guard.cjs')
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd='/workspace/vibecore-ui-safecontent',env=env,stdout=open(D/'server.log','w'),stderr=subprocess.STDOUT)
(D/'server-origin.json').write_text(json.dumps({'pid':p.pid,'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':12399,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'build':'safecontent existing UI975 plus merge main; no rebuild','apiProcess':api.pid}))
print(p.pid,api.pid)
