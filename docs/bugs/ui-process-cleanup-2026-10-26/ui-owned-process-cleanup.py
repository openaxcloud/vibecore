from pathlib import Path
import json,os,signal,time,socket
origins=['/tmp/ui-entry-next/server-origin.json','/tmp/ui-priority-nativezoom/server-origin.json','/tmp/ui-safecontent/baseline-origin.json','/tmp/ui-safecontent/compiled-origin.json']
def inspect(pid):
 p=Path(f'/proc/{pid}')
 if not (p/'stat').exists():return {'exists':False}
 s=(p/'stat').read_text();a=s[s.rfind(')')+2:].split();status=(p/'status').read_text();rss=next((x for x in status.splitlines() if x.startswith('VmRSS:')),None)
 return {'exists':True,'state':a[0],'startTicks':a[19],'cmd':(p/'cmdline').read_bytes().replace(b'\0',b' ').decode(),'rss':rss}
out=[]
for f in origins:
 o=json.loads(Path(f).read_text());assert o['port'] not in [5499,9399];b=inspect(o['pid']);r={'origin':f,'record':o,'before':b,'signals':[]};out.append(r)
 if b.get('state') in ['Z','X'] or not b['exists']:continue
 if b['startTicks']!=str(o['startTicks']) or '@react-router/serve/bin.js' not in b['cmd'] or 'build/server/index.js' not in b['cmd']:r['decision']='uncertain untouched';continue
 os.kill(o['pid'],signal.SIGTERM);r['signals'].append('SIGTERM')
time.sleep(3)
for r in out:
 o=r['record'];x=inspect(o['pid']);r['afterGrace']=x
 if r['signals'] and x['exists'] and x.get('state') not in ['Z','X']:
  if x['startTicks']==str(o['startTicks']) and x['cmd']==r['before']['cmd']:
   os.kill(o['pid'],signal.SIGKILL);r['signals'].append('SIGKILL')
  else:r['decision']='identity changed; no SIGKILL'
time.sleep(.3)
for r in out:
 r['final']=inspect(r['record']['pid']);s=socket.socket();s.settimeout(.2);r['portConnectCode']=s.connect_ex(('127.0.0.1',r['record']['port']));s.close()
Path('/tmp/ui-owned-process-cleanup.json').write_text(json.dumps(out,indent=2));print(json.dumps([{'pid':r['record']['pid'],'beforeRSS':r['before'].get('rss'),'signals':r['signals'],'final':r['final'],'portConnectCode':r['portConnectCode']} for r in out],indent=2))
