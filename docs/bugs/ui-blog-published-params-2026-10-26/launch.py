import subprocess,os,json,time,hashlib
from pathlib import Path
p=Path('/tmp/ui-blog-published-params');w=Path('/workspace/vibecore-ui-public-admin'); origins=[]
fixture="const http=require('http');http.createServer((q,r)=>{console.log(q.method,q.url);r.writeHead(q.method==='GET'?401:405,{'content-type':'application/json'});r.end(JSON.stringify({error:'Local anonymous GET-only fixture'}))}).listen(7199,'127.0.0.1')"
(p/'fixture.cjs').write_text(fixture)
for role,cmd,port,cwd in [('api',['node',str(p/'fixture.cjs')],7199,str(p)),('app',['./node_modules/.bin/react-router-serve','./build/server/index.js'],14299,str(w))]:
 log=str(p/(role+'.log')); f=open(log,'w'); c=subprocess.Popen(cmd,cwd=cwd,stdout=f,stderr=subprocess.STDOUT,env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','SAAS_API_URL':'http://127.0.0.1:7199','NODE_ENV':'production'})
 origins.append({'role':role,'pid':c.pid,'startTicks':Path(f'/proc/{c.pid}/stat').read_text().split()[21],'port':port,'log':log,'startedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())})
(p/'origins.json').write_text(json.dumps(origins,indent=2))
h=hashlib.sha256((w/'build/server/index.js').read_bytes()).hexdigest();assert h=='e2b7f974c130bb239d1c1d9d7d132d648e39b2a2b8f4c606a47368bbe7a6f23c',h
(p/'build.json').write_text(json.dumps({'sourceBuild':'cc5574d67ec1b37809fb7bbdfaa7519ac163cc38','bundleSHA256':h,'path':str(w/'build/server/index.js')},indent=2))
