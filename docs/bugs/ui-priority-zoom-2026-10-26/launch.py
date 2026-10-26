import subprocess,os,json,time
from pathlib import Path
D=Path('/tmp/ui-priority-nativezoom')
api=subprocess.Popen(['node',str(D/'fixture.cjs')],stdout=open(D/'api.log','w'),stderr=subprocess.STDOUT)
env={k:v for k,v in os.environ.items() if k not in ['DATABASE_URL','REDIS_URL','SAAS_API_URL','API_BASE_URL','NODE_OPTIONS']};env.update(PORT='13599',HOST='127.0.0.1',SAAS_API_URL='http://127.0.0.1:6799',API_BASE_URL='http://127.0.0.1:6799',NODE_ENV='production',NODE_OPTIONS='--require=/tmp/ui-priority-nativezoom/fetch-guard.cjs')
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd='/workspace/vibecore-ui-priority',env=env,stdout=open(D/'server.log','w'),stderr=subprocess.STDOUT)
(D/'server-origin.json').write_text(json.dumps({'pid':p.pid,'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':13599,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'build':'priority common existing build fbb678704; source frozen944592e18; no rebuild','apiProcess':api.pid}))
print(p.pid,api.pid)
