/** Read-only React Router manifest transport for the one owned local fixture. */
export function fixtureCanonicalPath(organization, project) {
 const segment=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]+$/.test(value);
 return segment(organization?.slug)&&segment(project?.slug)?`/@${organization.slug}/${project.slug}`:undefined;
}
export function isOwnedDiscovery(path,method,scope) {
 if(method!=='GET'||!scope||!/^[a-zA-Z0-9_-]+$/.test(scope.projectId??''))return false;
 if(!path.startsWith('/__manifest?')||path.length>4096||/[\\\r\n#]/.test(path))return false;
 const query=path.slice('/__manifest?'.length),params=new URLSearchParams(query);
 if([...params.keys()].sort().join(',')!=='paths,version'||params.toString()!==query)return false;
 if(!/^[a-f0-9]{8}$/.test(params.get('version')??''))return false;
 const project=`/projects/${scope.projectId}`;
 const allowed=new Set(['/','/api','/api/impersonation','/dashboard','/projects','/support','/account-settings',project,project+'/ide',project+'/deployments']);
 // Canonical alias is learned only from the same supported fixture creation responses.
 if(/^\/@[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(scope.canonicalProjectPath??'')){
  allowed.add(scope.canonicalProjectPath);allowed.add(scope.canonicalProjectPath.split('/').slice(0,2).join('/'));
 }
 const paths=(params.get('paths')??'').split(',');
 return paths.length>0&&paths.length<=32&&new Set(paths).size===paths.length&&paths.every(p=>allowed.has(p));
}
