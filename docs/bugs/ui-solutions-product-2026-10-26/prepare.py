from pathlib import Path
import json,re,hashlib,subprocess
R=Path('/workspace/vibecore-ui-priority');D=Path('/tmp/ui-solutions-product-next');a=json.loads((R/'docs/bugs/ui-next-allocation-2026-10-26/routes-allocation.json').read_text());rows=[r for r in a['routes'] if r['group'] in ['solutions','marketing_product']];assert len(rows)==30
records=[];files={}
for r in rows:
 n=r['id'][7:];f=r['ownedFiles'][0];s=(R/f).read_text()
 if n=='solutions._index':family='solutions-index';urls=['/solutions']
 elif n=='solutions.$slug':family='solutions-resolver';urls=['/solutions/synthetic-unknown','/solutions/internal-ai']
 elif n=='solutions.app-builder':family='solution-app-builder';urls=[r['routePattern']]
 elif n.startswith('solutions.'):family='solution-sales-factory';urls=[r['routePattern']]
 elif n=='ai-agent.studio':family='studio-redirect';urls=['/ai-agent/studio']
 elif 'MarketingStaticPage' in s:family='marketing-static-catalog';urls=[r['routePattern']]
 elif 'EcodeProductMarketingPages' in s:family='product-interactive-or-static';urls=[r['routePattern']]
 elif n=='bounties':family='bounties-transitive-wrapper';urls=['/bounties']
 else:family='exact-page';urls=[r['routePattern']]
 records.append({'id':r['id'],'group':r['group'],'file':f,'family':family,'urls':urls,'browserURL':urls[0] if n!='ai-agent.studio' else None,'expectedStatus':404 if n=='solutions.$slug' else 200,'sourceCoverage':'not_browser_tested','directDependencies':r['dependencyFiles'],'sourceEvidence':[{'line':i+1,'text':l.strip()} for i,l in enumerate(s.splitlines()) if l.startswith(('import ','export default')) or 'from ' in l or 'redirect(' in l]})
 for dep in [f]+r['dependencyFiles']:
  if (R/dep).is_file():files[dep]=hashlib.sha256((R/dep).read_bytes()).hexdigest()
for f in ['app/components/marketing/solutions/SolutionSalesPage.tsx','app/components/marketing/solutions/solution-sales.css','app/components/marketing/solutions/app-builder.css','app/components/marketing/solutions/solution-app-showcases.ts','app/components/marketing/ecode-exact/EcodeExactShell.tsx','app/components/marketing/ecode-exact/pages/Bounties.tsx','app/components/marketing/ecode-exact/pages/desktop-download.ts']:
 files[f]=hashlib.sha256((R/f).read_bytes()).hexdigest()
(D/'routes-plan.json').write_text(json.dumps({'sourceHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'groups':{'solutions':11,'marketing_product':19},'routeIDs':30,'routes':records,'formats':[[320,900],[360,800],[390,844],[844,390],[768,1024],[820,1180],[1024,768],[1280,800],[1440,900],[1920,1080],[2560,1440]],'languages':['fr','en'],'themes':['light','dark'],'status':'PREPARED_NOT_EXECUTED','sourceFiles':files},ensure_ascii=False,indent=2)+'\n')
print('Prepared30IDs',len(files),'source dependency hashes')
