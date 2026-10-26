import pathlib,json,os,signal,time,socket
D=pathlib.Path('/tmp/ui-solutions-product-next/after13899');out=[]
for name in ['server','api']:
 o=json.loads((D/(name+'-origin.json')).read_text());pid=o['pid'];p=pathlib.Path('/proc')/str(pid)
 def state():
  if not p.exists():return {'exists':False}
  s=(p/'stat').read_text().split(') ',1)[1].split();return {'exists':True,'state':s[0],'startTicks':s[19],'cmdline':(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(),'rss':next((x for x in (p/'status').read_text().splitlines() if x.startswith('VmRSS:')),None)}
 before=state();r={'origin':o,'before':before};assert before.get('startTicks')==o['startTicks'];assert ('react-router' in before['cmdline'] if name=='server' else 'fixture.cjs' in before['cmdline'])
 os.kill(pid,signal.SIGTERM);time.sleep(2);after=state()
 if after.get('state') not in [None,'Z']:
  assert after['startTicks']==o['startTicks'] and after['cmdline']==before['cmdline'];os.kill(pid,signal.SIGKILL);time.sleep(.5);after=state();r['sigkill']=True
 r['after']=after
 with socket.socket() as s:r['portConnectResult']=s.connect_ex(('127.0.0.1',o['port']))
 out.append(r)
(D/'cleanup.json').write_text(json.dumps(out,indent=2))
