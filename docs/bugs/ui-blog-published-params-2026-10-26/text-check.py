import re,json,pathlib
p=pathlib.Path('/tmp/ui-blog-published-params');source=pathlib.Path('/workspace/vibecore-ui-public-admin/app/lib/i18n/catalogs/marketing-blog-detail.ts').read_text();d=json.load(open(p/'receipt.json'));prefix={'introducing-e-code':'introducing','building-at-scale-how-we-handle-10m-requests':'scale','getting-started-with-e-code-in-5-minutes':'started'};norm=lambda s:re.sub(r'\s+',' ',s).strip();out=[]
for lang in ['fr','en']:
 chunk=source.split('export const marketingBlogDetailFr:')[1] if lang=='fr' else source.split('export const marketingBlogDetailFr:')[0]
 for slug,key in prefix.items():
  body=re.search(r"'marketingBlog.post\."+key+r"\.content': `([\s\S]*?)`",chunk).group(1)
  lines=[re.sub(r'^(?:#+\s*|-\s*|\d+\.\s*)','',line) for line in body.splitlines() if line.strip()]
  obs=[x for x in d['observations'] if x['slug']==slug and x['lang']==lang]
  missing=[{'theme':x['theme'],'width':x['width'],'missing':[line for line in lines if norm(line) not in norm(x['text'])]} for x in obs];missing=[x for x in missing if x['missing']]
  out.append({'slug':slug,'language':lang,'catalogContentLines':len(lines),'observationsChecked':len(obs),'missing':missing})
(p/'text-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps(out,ensure_ascii=False))
