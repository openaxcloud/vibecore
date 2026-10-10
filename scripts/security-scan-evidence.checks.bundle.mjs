// GENERATED FILE — DO NOT EDIT. Run node --import tsx scripts/build-security-scan-evidence.ts
import e from"node:assert/strict";import{spawnSync as k}from"node:child_process";import{chmodSync as w,existsSync as S,mkdtempSync as V,mkdirSync as q,readFileSync as l,rmSync as O,writeFileSync as y}from"node:fs";import{tmpdir as R}from"node:os";import{join as i}from"node:path";import o from"node:test";var a=l(new URL("../.github/workflows/deploy-main.yml",import.meta.url),"utf8"),p=l(new URL("../.github/workflows/ci.yml",import.meta.url),"utf8"),v="      - name: Vulnerability gate + SBOM on the exact digests (blocking)",m=a.indexOf(`        run: |
`,a.indexOf(v))+15,x=a.indexOf("          # Record each SBOM",m);e.ok(a.includes(v)&&x>m,"extract the real mandatory scan step");var h=a.slice(m,x).replace(/^          /gm,""),I=`#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + '\\n');
const ref = args.at(-1);
if (option('--severity') === 'HIGH') process.exit(0);
if (option('--format') === 'cyclonedx') {
  fs.writeFileSync(option('--output'), JSON.stringify({components: []}));
  process.exit(0);
}
if (process.env.ISSUE === 'scanner-error') process.exit(2);
if (process.env.ISSUE === 'invalid-report') {
  fs.writeFileSync(option('--output'), '{not-json');
  process.exit(0);
}
if (process.env.ISSUE === 'missing-report') process.exit(0);
const vulnerable = process.env.ISSUE === 'critical' && ref.includes('/api@');
if (args.includes('--output')) fs.writeFileSync(option('--output'), JSON.stringify({
  Results: [{Target: ref, Vulnerabilities: vulnerable ? [{VulnerabilityID: 'CVE-TEST-001',
    PkgName: 'test-package', InstalledVersion: '1.0.0', FixedVersion: '1.0.1'}] : []}]
}));
process.exit(vulnerable && args.includes('--exit-code') ? Number(option('--exit-code')) : 0);
`;function u(s){let t=V(i(R(),"vibecore-scan-evidence-"));try{q(i(t,"bin"));let r=i(t,"bin","trivy");y(r,I),w(r,493);let c=i(t,"services.json");y(c,JSON.stringify(["api","web"].map(n=>({service:n,image:n,digest:"sha256:"+(n==="api"?"a":"b").repeat(64)}))));let d=i(t,"calls.jsonl"),E=k("bash",["-c",h.replaceAll("/tmp/services.json",c)],{cwd:t,encoding:"utf8",env:{...process.env,ISSUE:s,CALLS:d,REG:"example.test/images",PATH:i(t,"bin")+":"+process.env.PATH}}),f={},g=[];for(let n of["api","web"]){let b=i(t,"sbom",n+".critical.json");S(b)&&s!=="invalid-report"&&(f[n]=JSON.parse(l(b,"utf8"))),g.push(JSON.parse(l(i(t,"sbom",n+".scan-status.json"),"utf8")))}return{...E,reports:f,statuses:g,sboms:["api","web"].map(n=>S(i(t,"sbom",n+".cdx.json"))),calls:l(d,"utf8").trim().split(`
`).map(n=>JSON.parse(n))}}finally{O(t,{recursive:!0,force:!0})}}o("clean scan succeeds and retains the exact digest verdict for each service",()=>{let s=u("clean");e.equal(s.status,0,s.stderr),e.deepEqual(s.sboms,[!0,!0]);for(let t of["api","web"]){let r=s.reports[t];e.ok(r),e.match(r.Results[0].Target,/@sha256:[ab]{64}$/),e.deepEqual(r.Results[0].Vulnerabilities,[])}});o("a fixable critical blocks deployment but preserves the CVE and both inventories",()=>{let s=u("critical");e.equal(s.status,1),e.deepEqual(s.sboms,[!0,!0]),e.ok(s.reports.api),e.equal(s.reports.api.Results[0].Vulnerabilities[0].VulnerabilityID,"CVE-TEST-001"),e.equal(s.reports.api.Results[0].Vulnerabilities[0].FixedVersion,"1.0.1"),e.match(s.stdout,/CVE-TEST-001\ttest-package\t1.0.0\t1.0.1/),e.match(s.stdout,/Vulnerability gate FAILED/)});o("scanner infrastructure errors remain fail-closed, not clean verdicts",()=>{let s=u("scanner-error");e.notEqual(s.status,0),e.deepEqual(s.reports,{}),e.deepEqual(s.sboms,[!0,!0]),e.deepEqual(s.statuses.map(t=>[t.scannerExit,t.reportValid,t.sbomExit]),[[2,!1,0],[2,!1,0]])});for(let s of["invalid-report","missing-report"])o(`${s} cannot become a clean verdict or truncate later image inventories`,()=>{let t=u(s);e.equal(t.status,1),e.deepEqual(t.sboms,[!0,!0]),e.equal(t.statuses.length,2),e.ok(t.statuses.every(r=>r.scannerExit===0&&!r.reportValid))});o("the blocking command retains severity, fixability and nonzero exit enforcement",()=>{let t=u("clean").calls.filter(r=>r.includes("CRITICAL"));e.equal(t.length,2);for(let r of t){for(let c of["--ignore-unfixed","--scanners","--ignorefile","--exit-code","--format","--output"])e.ok(r.includes(c),c);e.equal(r[r.indexOf("--exit-code")+1],"1"),e.equal(r[r.indexOf("--format")+1],"json")}});o("failure artifacts and regression tests remain mandatory in the actual workflows",()=>{e.match(a,/name: Upload release manifest and SBOMs\n\s+if: always\(\)[\s\S]*?path: sbom\//),e.match(p,/name: Blocking vulnerability evidence regression tests\n\s+run: node --test scripts\/security-scan-evidence\.checks\.bundle\.mjs/),e.match(p,/tsc --project tsconfig.security-scan-evidence.json/),e.match(p,/build-security-scan-evidence.ts --check/),e.ok(!h.includes("continue-on-error"))});
