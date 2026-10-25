const http=require('node:http');const fs=require('node:fs');
const user={id:'synthetic-ui',name:'Camille Exemple Utilisateur synthétique uniquement',email:'camille.longue.adresse.de.recette@example.test',timezone:'Europe/Paris'};
const credits={creditsEnabled:true,shadow:false,balanceCents:800,packBalanceCents:1000,totalAvailableCents:1800,budgetCapCents:5000,serviceShutdownCents:10000,paygSpentCents:3400,monthlyGrantCents:2000,blockExternalAi:false,periodStart:'2026-10-01T00:00:00Z',periodEnd:'2026-11-01T00:00:00Z',checkpoints:[],activePacks:[],ledger:[{id:'synthetic-ledger',deltaCents:-150,kind:'usage',reason:'Consommation synthétique longue pour recette uniquement',createdAt:'2026-10-24T14:00:00Z'}],packCatalog:[]};
const base={
 '/auth/me':{user},'/orgs':{organizations:[{id:'synthetic-org',name:'Organisation synthétique pour recette responsive',role:'OWNER'}]},
 '/orgs/synthetic-org/billing':{plan:{key:'pro',name:'Pro',monthlyCents:2500},subscription:{status:'active',currentPeriodEnd:'2026-11-01T00:00:00Z'},usage:[],upgradePrompts:[]},
 '/orgs/synthetic-org/credits':credits,
 '/account/deletion':{status:'none',canCancel:false,requestedAt:null,purgeDueAt:null,gracePeriodDays:14,scope:{deleted:['projects'],retained:['invoices']}},
 '/api/account/connections':{connections:[{id:'synthetic-connection',provider:'github',externalAccountLabel:'organisation-synthetique-etiquette-tres-longue-pour-recette-responsive',status:'active',forAgentUse:true,revokedAt:null,createdAt:'2026-10-01T00:00:00Z'}]},
 '/auth/connections':{connections:[{provider:'google',externalId:'identifiant-synthetique-tres-long-uniquement-pour-recette',createdAt:'2026-10-01T00:00:00Z'}]},
 '/api/account/reconnection-alerts':{alerts:[]},'/user/notifications':{notifications:[]},'/user/preferences':{preferences:{}}
};
http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');const path=new URL(req.url,'http://127.0.0.1').pathname;console.log(req.method,path);const extra=fs.existsSync('/tmp/ui-next/extra.json')?JSON.parse(fs.readFileSync('/tmp/ui-next/extra.json','utf8')):{};const all={...base,...extra};if(req.method!=='GET'){res.statusCode=503;res.end(JSON.stringify({error:'Synthetic fixture rejects mutations'}));return;}if(path in all){res.end(JSON.stringify(all[path]));return;}res.statusCode=404;res.end(JSON.stringify({error:'Unconfigured synthetic fixture',path}));}).listen(3199,'127.0.0.1');
