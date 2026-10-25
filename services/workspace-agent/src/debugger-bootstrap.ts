/** Node's inspector runs in a worker so pausing the main thread cannot pause the
 * control transport. The inherited fd is private to this child: no inspector
 * listener, discovery URL, preview route, or extra network permission exists. */
const workerSource = String.raw`
const { parentPort, workerData } = require('node:worker_threads');
const { Session } = require('node:inspector');
const { Socket } = require('node:net');
const channel = new Socket({ fd: 3, readable: true, writable: true });
const inspector = new Session();
inspector.connectToMainThread();
const urls = new Map();
const send = value => channel.write(JSON.stringify(value) + '\n');
const post = (method, params = {}) => new Promise((resolve, reject) =>
  inspector.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
inspector.on('Debugger.scriptParsed', ({params}) => {
  if (urls.size < 10000) urls.set(params.scriptId, params.url);
});
let entryBreakpoint;
inspector.on('Debugger.paused', ({params}) => {
  const frames = params.callFrames.slice(0, 64).map(frame => ({...frame, url: urls.get(frame.location.scriptId) || frame.url}));
  if (entryBreakpoint && params.hitBreakpoints?.includes(entryBreakpoint)) {
    const temporary = entryBreakpoint;
    entryBreakpoint = undefined;
    void post('Debugger.removeBreakpoint', {breakpointId:temporary}).catch(() => process.exit(1));
  }
  send({event:'paused', params:{reason:params.reason, callFrames:frames}});
});
inspector.on('Debugger.resumed', () => send({event:'resumed'}));
let buffer = '';
channel.setEncoding('utf8');
channel.on('data', chunk => {
  buffer += chunk;
  if (buffer.length > 1048576) process.exit(1);
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
    let command;
    try { command = JSON.parse(line); } catch { process.exit(1); }
    post(command.method, command.params).then(
      result => send({id:command.id, result}),
      () => send({id:command.id, error:'DEBUGGER_COMMAND_FAILED'})
    );
  }
});
channel.on('error', () => process.exit(1));
channel.on('close', () => process.exit(1));
(async () => {
  await post('Debugger.enable', {maxScriptsCacheSize: 1048576});
  for (const bp of workerData.breakpoints) {
    await post('Debugger.setBreakpointByUrl', {url:bp.url, lineNumber:bp.line - 1});
  }
  if (workerData.entryUrl && !workerData.breakpoints.some(bp => bp.url === workerData.entryUrl && bp.line === 1)) {
    entryBreakpoint = (await post('Debugger.setBreakpointByUrl', {url:workerData.entryUrl, lineNumber:0})).breakpointId;
  }
  send({event:'ready'});
  parentPort.postMessage('ready');
})().catch(() => { send({event:'failed'}); process.exit(1); });
`;

export const debuggerBootstrapSource = String.raw`
const { Worker } = require('node:worker_threads');
const config = JSON.parse(process.argv[1]);
const worker = new Worker(${JSON.stringify(workerSource)}, {eval:true, workerData:config});
worker.once('error', () => process.exit(1));
worker.once('message', () => {
  worker.unref();
  process.argv = [process.execPath, config.program, ...config.args];
  require('node:module').runMain(config.program);
});
`;
