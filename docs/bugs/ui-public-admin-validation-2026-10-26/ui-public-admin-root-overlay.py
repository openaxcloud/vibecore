"""Prepared only. Run --apply after all recipes stop. No install/source/config edits."""
from pathlib import Path
import os,json,sys
root=Path('/workspace/vibecore-ui-public-admin')
modules=root/'node_modules'
expected=Path('/workspace/vibecore-ui-next/node_modules')
assert modules.is_symlink() and modules.resolve()==expected, 'Root dependency layout changed; inspect before retry'
local={}
for group in ['packages','services','apps']:
 for manifest in (root/group).glob('*/package.json'):
  data=json.loads(manifest.read_text());name=data.get('name','')
  if name.startswith(('@vibecore/','@e-code/')):local[name]=str(manifest.parent)
plan={}
for entry in expected.iterdir():
 if entry.name in ['@vibecore','@e-code']:
  for package in entry.iterdir():
   name=entry.name+'/'+package.name
   plan[name]=local.get(name,str(package.resolve()))
 else:plan[entry.name]=str(entry.resolve())
for name,path in local.items():plan[name]=path
record={'root':str(root),'originalLink':os.readlink(modules),'links':plan,'scope':'Only root node_modules symlink replaced by local directory; targets unchanged'}
Path('/tmp/ui-public-admin-root-overlay-plan.json').write_text(json.dumps(record,indent=2))
print(json.dumps({'links':len(plan),'localWorkspaceLinks':sum(v in local.values() for v in plan.values()),'apply':sys.argv[1:] == ['--apply']}))
if sys.argv[1:] != ['--apply']:sys.exit(0)
stage=root/'node_modules.ui-local-stage'
assert not stage.exists(), 'Unexpected stage; inspect manually'
stage.mkdir()
try:
 for name,target in plan.items():
  dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.symlink_to(target,target_is_directory=Path(target).is_dir())
 assert modules.is_symlink() and modules.resolve()==expected
 modules.unlink()
 try:stage.rename(modules)
 except BaseException:
  modules.symlink_to(record['originalLink'],target_is_directory=True)
  raise
except BaseException:
 raise
Path('/tmp/ui-public-admin-root-overlay-applied.json').write_text(json.dumps(record,indent=2))
