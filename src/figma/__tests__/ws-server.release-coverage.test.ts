import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import type { AgentBoxState } from '../../plugin/shared/contracts.js';
import type { MemoireEvent } from '../../engine/core.js';
const transport = vi.hoisted(() => ({ servers: [] as Array<EventEmitter & { config: { verifyClient: (input: { origin?: string }, done: (...args: unknown[])=>void)=>void }; close: ReturnType<typeof vi.fn> }>, errors: [] as Error[] }));
const probes = vi.hoisted(() => ({ inUse: vi.fn(), owner: vi.fn(), memi: vi.fn(), capability: vi.fn() }));
vi.mock('../port-scanner.js', () => ({ BRIDGE_PORT_START: 9223, BRIDGE_PORT_END: 9225, isPortInUse: probes.inUse, getPortOwnerPid: probes.owner, isMemoireProcess: probes.memi }));
vi.mock('../../security/bridge-capability.js', async importOriginal => ({ ...await importOriginal<object>(), readBridgeCapability: probes.capability }));
vi.mock('ws', async () => {
 const { EventEmitter } = await import('node:events');
 return { WebSocket: { OPEN: 1 }, WebSocketServer: class extends EventEmitter {
  close = vi.fn();
  constructor(readonly config: unknown) { super(); transport.servers.push(this as unknown as typeof transport.servers[number]); const error = transport.errors.shift(); Promise.resolve().then(() => error ? this.emit('error', error) : this.emit('listening')); }
 } };
});
import { MemoireWsServer, isAllowedBridgeOrigin, verifyBridgeCapability } from '../ws-server.js';
const CAPABILITY = 'A'.repeat(43);
class Socket extends EventEmitter {
 readyState = 1; sent: Array<Record<string, unknown>> = [];
 send = vi.fn((text: string) => { this.sent.push(JSON.parse(text)); });
 close = vi.fn((_code?: number, _reason?: string) => { this.readyState = 3; });
 ping = vi.fn();
 message(value: unknown) { this.emit('message', Buffer.from(JSON.stringify(value))); }
 disconnect() { this.readyState = 3; this.emit('close'); }
}
const servers: MemoireWsServer[] = [];
async function fixture(config: ConstructorParameters<typeof MemoireWsServer>[0] = {}) {
 const server = new MemoireWsServer({ capabilityToken: CAPABILITY, ...config }); servers.push(server); await server.start(); return server;
}
function connect(server: MemoireWsServer, authenticate = true): Socket {
 const socket = new Socket(); transport.servers.at(-1)!.emit('connection', socket);
 if (authenticate) {
  const identify = socket.sent[0]; const proof = createHmac('sha256', CAPABILITY).update(`memoire-figma-bridge-v3:client:${identify.challenge}`).digest('base64url');
  socket.message({ type:'bridge-hello', file:'Synthetic', fileKey:'fixture', editor:'figma', protocolVersion:3, proof });
  expect(server.connectedClients.length).toBeGreaterThan(0);
 }
 return socket;
}
function command(socket: Socket) { return socket.sent.filter(message => message.type === 'command').at(-1)!; }
beforeEach(() => { vi.useFakeTimers(); transport.servers.length=0; transport.errors.length=0; probes.inUse.mockReset().mockResolvedValue(false); probes.owner.mockReset().mockReturnValue(null); probes.memi.mockReset().mockReturnValue(false); probes.capability.mockReset().mockResolvedValue(CAPABILITY); });
afterEach(() => { for(const server of servers.splice(0))server.stop(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('WebSocket lifecycle and pairing failure paths', () => {
 it('rejects malformed capabilities and missing pairing without opening a listener', async () => {
  const invalid = new MemoireWsServer({ capabilityToken:'invalid' }); await expect(invalid.start()).rejects.toThrow('invalid');
  probes.capability.mockRejectedValue(new Error('missing')); const missing = new MemoireWsServer(); await expect(missing.start()).rejects.toThrow('securely pair'); expect(transport.servers).toHaveLength(0);
  expect(isAllowedBridgeOrigin('figma://desktop')).toBe(true); expect(isAllowedBridgeOrigin('not a URL')).toBe(false); expect(verifyBridgeCapability('x','long')).toBe(false);
 });
 it('scans occupied ports with identified and unknown owners, and rejects exhausted ranges', async () => {
  for (const owner of [null, 100, 101]) {
   probes.owner.mockReturnValue(owner); probes.memi.mockReturnValue(owner === 101); probes.inUse.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
   const server = await fixture(); expect(server.activePort).toBe(9224); server.stop();
  }
  probes.inUse.mockResolvedValue(true); const blocked = new MemoireWsServer({ capabilityToken:CAPABILITY }); await expect(blocked.start()).rejects.toThrow('No available ports');
 });
 it('retries bind collisions, attempts binding after failed probes and preserves fatal bind errors', async () => {
  probes.inUse.mockRejectedValueOnce(new Error('probe unavailable')); transport.errors.push(Object.assign(new Error('occupied'),{code:'EADDRINUSE'}));
  const server = await fixture(); expect(server.activePort).toBe(9224); expect(await server.start()).toBe(9224);
  transport.errors.push(Object.assign(new Error('denied'),{code:'EACCES'})); const denied = new MemoireWsServer({capabilityToken:CAPABILITY,port:9999}); await expect(denied.start()).rejects.toMatchObject({code:'EACCES',port:9999});
  const preferred = new MemoireWsServer(); servers.push(preferred); expect(await preferred.start(9998)).toBe(9998); expect(probes.capability).toHaveBeenCalled();
 });
 it('checks browser origins and reports authenticated connection identity', async () => {
  const server = await fixture({ instanceName:'Synthetic bridge',studioUrl:'http://127.0.0.1:1',runtimeUrl:'http://127.0.0.1:2',onEvent:vi.fn() }); const verify = transport.servers.at(-1)!.config.verifyClient; const done = vi.fn();
  verify({origin:'https://figma.com'},done); expect(done).toHaveBeenLastCalledWith(true); verify({origin:'https://evil.example'},done); expect(done).toHaveBeenLastCalledWith(false,403,'Forbidden origin');
  expect(server.getStatus()).toMatchObject({running:true,pluginStatus:'disconnected',lastConnectedAt:null}); const socket = connect(server);
  expect(server.getConnectionState()).toBe('connected'); expect(server.lastConnectedAt).toBeInstanceOf(Date); expect(server.getStatus().clients[0]).toMatchObject({file:'Synthetic',fileKey:'fixture'});
  socket.message({type:'bridge-hello',file:'Renamed',editor:'figjam'}); expect(server.connectedClients[0].file).toBe('Renamed');
  socket.emit('pong'); socket.emit('error',new Error('synthetic socket')); expect(server.running).toBe(true);
 });
 it('rejects unauthenticated activity, invalid proofs and incomplete pairing on shutdown', async () => {
  const server = await fixture(); const unauth = connect(server,false); unauth.message({type:'ping'}); expect(unauth.close).toHaveBeenCalledWith(1008,expect.stringContaining('upgrade')); unauth.disconnect();
  const forged = connect(server,false); forged.message({type:'bridge-hello',protocolVersion:3,proof:'B'.repeat(43)}); expect(forged.close).toHaveBeenCalledWith(1008,expect.stringContaining('Invalid')); forged.disconnect();
  const waiting = connect(server,false); server.stop(); expect(waiting.close).toHaveBeenCalledWith(1008,'Authentication incomplete'); expect(server.getStatus()).toMatchObject({running:false,port:0,bridgeStatus:'stopped'});
 });
 it('handles an early identify-send failure without activating the socket', async () => {
  const server = await fixture(); const socket = new Socket(); socket.send.mockImplementation(()=>{throw new Error('gone');}); transport.servers.at(-1)!.emit('connection',socket); expect(server.connectedClients).toEqual([]);
 });
});

describe('WebSocket command ownership, completion and cancellation', () => {
 it('requires a plugin and ignores responses from a different authenticated client', async () => {
  const server = await fixture(); await expect(server.sendCommand('getSelection')).rejects.toThrow('No Figma'); const first = connect(server); const second = connect(server);
  const resolved = vi.fn(); const pending = server.sendCommand('getSelection').then(resolved); const id = command(first).id;
  second.message({type:'response',id,result:'forged'}); await Promise.resolve(); expect(resolved).not.toHaveBeenCalled();
  first.message({type:'response',id,result:{selected:['a']}}); await pending; expect(resolved).toHaveBeenCalledWith({selected:['a']});
  second.disconnect(); expect(server.getConnectionState()).toBe('connected');
 });
 it('deduplicates reads, releases dedup after success/error/timeout and accepts concurrent writes', async () => {
  const server = await fixture(); const socket = connect(server); const first = server.sendCommand('getSelection');
  await expect(server.sendCommand('getSelection')).rejects.toThrow('already in-flight'); socket.message({type:'response',id:command(socket).id,result:[]}); await expect(first).resolves.toEqual([]);
  const rejected = server.sendCommand('getSelection'); const rejection = expect(rejected).rejects.toThrow('plugin rejected'); socket.message({type:'response',id:command(socket).id,error:'plugin rejected'}); await rejection;
  const timed = server.sendCommand('getSelection',{},10); const timeout = expect(timed).rejects.toThrow('timed out'); await vi.advanceTimersByTimeAsync(10); await timeout;
  const writes = [server.sendCommand('createNode'),server.sendCommand('createNode')]; const ids = socket.sent.filter(message=>message.type==='command').slice(-2).map(message=>message.id); for(const id of ids)socket.message({type:'response',id,result:true}); await expect(Promise.all(writes)).resolves.toEqual([true,true]);
 });
 it('rejects pending work on disconnection and server shutdown', async () => {
  const server = await fixture(); const socket = connect(server); const pending = expect(server.sendCommand('getSelection')).rejects.toThrow('disconnected'); socket.disconnect(); await pending;
  expect(server.isReconnecting).toBe(true); expect(server.lastDisconnectedAt).toBeInstanceOf(Date); connect(server); expect(server.isReconnecting).toBe(false);
  const stopped = expect(server.sendCommand('getComponents')).rejects.toThrow('shutting down'); server.stop(); await stopped;
 });
 it('cleans up send failures and refuses a socket closing between selection and send', async () => {
  const server = await fixture(); const socket = connect(server); socket.send.mockImplementationOnce(()=>{throw new Error('send failed');}); await expect(server.sendCommand('getSelection')).rejects.toThrow('Failed to send');
  let reads=0; Object.defineProperty(socket,'readyState',{configurable:true,get:()=>++reads===1?1:3}); await expect(server.sendCommand('getSelection')).rejects.toThrow('not open'); Object.defineProperty(socket,'readyState',{configurable:true,writable:true,value:3});
 });
 it('reports measured health on successful ping and unknown latency on failed ping', async () => {
  const server = await fixture(); expect(await server.checkHealth()).toMatchObject({connected:false,latencyMs:null}); const socket = connect(server);
  const health = server.checkHealth(); socket.message({type:'response',id:command(socket).id,result:'pong'}); expect(await health).toMatchObject({connected:true,clientCount:1,latencyMs:expect.any(Number)});
  const failed = server.checkHealth(); socket.message({type:'response',id:command(socket).id,error:'unsupported'}); expect(await failed).toMatchObject({connected:true,latencyMs:null});
 });
});

describe('WebSocket events, resource limits and reconnect state', () => {
 it('emits supported protocol events and ignores server-only frames', async () => {
  const server = await fixture(); const socket = connect(server);
  for (const type of ['selection','page-changed','document-changed','connection-state','job-status','heal-result','agent-status','agent-message']) {
   const event = vi.fn(); server.once(type,event); socket.message({channel:'memoire.bridge.v2',source:'plugin',type,data:{fixture:type}}); expect(event).toHaveBeenCalledWith({fixture:type});
  }
  const action=vi.fn();server.once('action-result',action);socket.message({type:'action-result',action:'select',result:true});expect(action).toHaveBeenCalledWith({action:'select',result:true,error:undefined});
  const sync=vi.fn();server.once('sync-data',sync);socket.message({type:'sync-data',part:'tokens',summary:{},result:[1]});expect(sync).toHaveBeenCalledWith(expect.objectContaining({part:'tokens',result:[1]}));
  for(const type of ['chat','agent-register','agent-deregister','identify','event','error','pong','token-push','variable-changed','component-changed','unknown'])socket.message({channel:'memoire.bridge.v2',source:'plugin',type});
  socket.message({channel:'memoire.bridge.v2',source:'plugin',type:'response',id:3}); socket.message({type:'response',id:'unknown',result:true});
  expect(server.connectedClients).toHaveLength(1);
 });
 it('broadcasts chats, events and agent status and tolerates closed or failing peers', async () => {
  const server=await fixture();const first=connect(server);const closed=connect(server);closed.readyState=3;
  server.sendChat('hello');expect(first.sent.at(-1)).toMatchObject({type:'chat',text:'hello',from:'memoire-terminal'});
  const event={type:'info',source:'fixture',message:'event',timestamp:new Date()} as MemoireEvent;server.sendEvent(event);expect(first.sent.at(-1)).toMatchObject({type:'event',message:'event'});
  const status=vi.fn();server.on('agent-status',status);server.sendAgentStatus({id:'a'} as unknown as AgentBoxState);expect(status).toHaveBeenCalledWith({id:'a'});
  first.send.mockImplementationOnce(()=>{throw new Error('gone');});expect(()=>server.broadcast({fixture:true})).not.toThrow();
  const named=await fixture({instanceName:'Named'});const peer=connect(named);named.sendChat('x');expect(peer.sent.at(-1)?.from).toBe('Named');
 });
 it('handles malformed frames, caps message size and enforces a renewable rate window', async () => {
  const server=await fixture();const socket=connect(server);socket.emit('message',Buffer.from('{'));socket.message({unsupported:true});
  socket.emit('message','x'.repeat(10_000_001));expect(socket.sent.at(-1)).toMatchObject({type:'error',message:expect.stringContaining('too large')});
  socket.message({type:'ping'});expect(socket.sent.at(-1)?.type).toBe('pong');
  socket.send.mockImplementationOnce(()=>{throw new Error('gone');});socket.message({type:'ping'});
  for(let i=0;i<1000;i++)socket.message({type:'ping'});expect(socket.sent.at(-1)).toMatchObject({type:'error',message:expect.stringContaining('Rate limit')});
  socket.ping.mockImplementation(()=>socket.emit('pong'));await vi.advanceTimersByTimeAsync(61000);socket.message({type:'ping'});expect(socket.sent.at(-1)?.type).toBe('pong');
 });
 it('pings live clients, drops stale peers and rejects work from unresponsive plugins', async () => {
  const server=await fixture();const closed=connect(server);const live=connect(server);closed.readyState=3;live.ping.mockImplementationOnce(()=>{throw new Error('ping failed');});
  await vi.advanceTimersByTimeAsync(30000);expect(server.connectedClients).toHaveLength(1);expect(live.ping).toHaveBeenCalled();
  const pending=expect(server.sendCommand('getSelection',{},120000)).rejects.toThrow('unresponsive');live.close.mockImplementationOnce(()=>{throw new Error('close failed');});await vi.advanceTimersByTimeAsync(30000);await pending;expect(server.connectedClients).toHaveLength(0);
 });
 it('emits bounded reconnect attempts, gives up after five and cancels on reconnection', async () => {
  const server=await fixture();const socket=connect(server);const attempts=vi.fn();const failure=vi.fn();server.on('reconnecting',attempts);server.on('reconnect-failed',failure);socket.disconnect();
  await vi.advanceTimersByTimeAsync(31000);expect(attempts).toHaveBeenCalledTimes(5);expect(failure).toHaveBeenCalledWith({attempts:5});expect(server.reconnectAttempts).toBe(5);expect(server.getConnectionState()).toBe('disconnected');
  const reconnected=connect(server);expect(server.reconnectAttempts).toBe(0);reconnected.disconnect();await vi.advanceTimersByTimeAsync(500);connect(server);await vi.advanceTimersByTimeAsync(1000);expect(server.getConnectionState()).toBe('connected');
 });
});

it('releases an in-flight read when the same server is stopped and restarted', async () => {
 const server = await fixture(); connect(server);
 const original = expect(server.sendCommand('getSelection')).rejects.toThrow('shutting down');
 server.stop(); await original; await server.start(); const socket = connect(server);
 const retry = server.sendCommand('getSelection'); const result = expect(retry).resolves.toEqual([]);
 const sent = command(socket); if (sent) socket.message({type:'response',id:sent.id,result:[]});
 await result;
});
