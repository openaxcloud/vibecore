import subprocess,os,json,time,hashlib
from pathlib import Path
D=Path('/tmp/ui-solutions-product-next/after13899');R=Path('/workspace/vibecore-ui-public-admin');env={k:v for k,v in os.environ.items() if k not in ['DATABASE_URL','REDIS_URL','SAAS_API_URL','API_BASE_URL','NODE_OPTIONS']};env.update(UI_FIXTURE_PORT='6899')
a=subprocess.Popen(['node',str(D/'fixture.cjs')],env=env,stdout=open(D/'api.log','w'),stderr=subprocess.STDOUT)
env.update(PORT='13899',HOST='127.0.0.1',SAAS_API_URL='http://127.0.0.1:6899',API_BASE_URL='http://127.0.0.1:6899',UI_FIXTURE_ORIGIN='http://127.0.0.1:6899',NODE_ENV='production',NODE_OPTIONS='--require='+str(D/'fetch-guard.cjs'))
p=subprocess.Popen(['./node_modules/.bin/react-router-serve','./build/server/index.js'],cwd=R,env=env,stdout=open(D/'server.log','w'),stderr=subprocess.STDOUT)
(D/'server-origin.json').write_text(json.dumps({'pid':p.pid,'startTicks':Path(f'/proc/{p.pid}/stat').read_text().split()[21],'port':13899,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'cwd':str(R),'buildSHA256':hashlib.sha256((R/'build/server/index.js').read_bytes()).hexdigest(),'args':['react-router-serve','./build/server/index.js'],'apiPID':a.pid},indent=2));print(p.pid,a.pid)
