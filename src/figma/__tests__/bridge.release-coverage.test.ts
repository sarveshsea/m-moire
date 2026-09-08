import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { AgentBoxState } from '../../plugin/shared/contracts.js';
const state = vi.hoisted(() => ({ instances: [] as Array<Record<string, unknown>> }));
vi.mock('../ws-server.js', async () => {
 const { EventEmitter } = await import('node:events');
 return { MemoireWsServer: class extends EventEmitter {
  connectedClients: unknown[] = []; reconnectAttempts = 2; lastConnectedAt = new Date(100); lastDisconnectedAt = new Date(200);
  start = vi.fn(async () => 9300); stop = vi.fn(); sendCommand = vi.fn(async () => ({})); sendChat = vi.fn(); sendAgentStatus = vi.fn();
  getConnectionState = vi.fn(() => 'disconnected'); getStatus = vi.fn(() => ({ running: true }));
  constructor(readonly config: Record<string, unknown>) { super(); state.instances.push(this as unknown as Record<string, unknown>); }
 } };
});
import { FigmaBridge } from '../bridge.js';
function fixture(config = {}) { const bridge = new FigmaBridge(config); return { bridge, server: bridge.wsServer as unknown as EventEmitter & { connectedClients: unknown[]; sendCommand: ReturnType<typeof vi.fn>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; sendChat: ReturnType<typeof vi.fn>; sendAgentStatus: ReturnType<typeof vi.fn>; config: { onEvent: (event: unknown) => void } } }; }
beforeEach(() => { vi.useFakeTimers(); state.instances.length = 0; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Figma bridge transport and recovery contracts', () => {
 it('delegates connection state, command timeouts and operator status to the transport', async () => {
  const onEvent = vi.fn(); const { bridge, server } = fixture({ onEvent });
  expect(await bridge.connect(9400)).toBe(9300); expect(server.start).toHaveBeenCalledWith(9400); expect(onEvent).toHaveBeenCalled();
  expect(bridge.isConnected).toBe(false); server.connectedClients = [{}]; expect(bridge.isConnected).toBe(true);
  expect(bridge.getConnectionState()).toBe('disconnected'); expect(bridge.reconnectAttempts).toBe(2); expect(bridge.lastConnectedAt).toEqual(new Date(100)); expect(bridge.lastDisconnectedAt).toEqual(new Date(200));
  expect(bridge.getStatus()).toEqual({ running: true });
  await bridge.execute('return 1'); await bridge.execute('return 2', 5); await bridge.getSelection(); await bridge.getWidgetSnapshot(); await bridge.getWidgetSnapshot(9); await bridge.getFileData(); await bridge.getFileData(7);
  expect(server.sendCommand).toHaveBeenCalledWith('execute', { code: 'return 1' }, 30000);
  expect(server.sendCommand).toHaveBeenCalledWith('widgetSnapshot', {}, 9); expect(server.sendCommand).toHaveBeenCalledWith('getFileData', { depth: 7 }, 60000);
  bridge.sendChat('hello'); expect(server.sendChat).toHaveBeenCalledWith('hello');
  bridge.publishAgentStatus({ id: 'a' } as unknown as AgentBoxState); expect(server.sendAgentStatus).toHaveBeenCalledWith({ id: 'a' });
  await bridge.disconnect(); expect(server.stop).toHaveBeenCalledOnce();
 });
 it('propagates server and plugin events without manufacturing payloads', () => {
  const onEvent = vi.fn(); const { bridge, server } = fixture({ onEvent });
  for (const event of ['chat','selection','page-changed','document-changed','action-result','connection-state','job-status','heal-result','agent-status','sync-result','sync-data','variable-changed','component-changed']) {
   const listener = vi.fn(); bridge.once(event, listener); server.emit(event, { marker: event }); expect(listener).toHaveBeenCalledWith({ marker: event });
  }
  const listener = vi.fn(); bridge.on('event', listener); server.config.onEvent({ type: 'info' }); expect(listener).toHaveBeenCalledWith({ type: 'info' }); expect(onEvent).toHaveBeenCalledWith({ type: 'info' });
  const noCallback = fixture(); expect(() => noCallback.server.config.onEvent({ type: 'info' })).not.toThrow();
 });
 it('coalesces reconnect selection resync, handles failure and cancels pending resync on disconnect', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5); const { bridge, server } = fixture(); const selected = vi.fn(); bridge.on('selection', selected);
  server.sendCommand.mockResolvedValueOnce({ ids: ['a'] }); server.emit('client-connected', { id: '1' }); server.emit('client-connected', { id: '2' });
  await vi.advanceTimersByTimeAsync(100); expect(server.sendCommand).toHaveBeenCalledTimes(1); expect(selected).toHaveBeenCalledWith({ ids: ['a'] });
  server.sendCommand.mockRejectedValueOnce(new Error('temporary')); server.emit('client-connected', {}); await vi.advanceTimersByTimeAsync(100); expect(selected).toHaveBeenCalledTimes(1);
  const disconnected = vi.fn(); bridge.on('plugin-disconnected', disconnected); server.emit('client-disconnected'); server.connectedClients = [{}]; server.emit('client-disconnected'); expect(disconnected).toHaveBeenCalledTimes(2);
  server.emit('client-connected', {}); await bridge.disconnect(); await vi.advanceTimersByTimeAsync(10000); expect(server.sendCommand).toHaveBeenCalledTimes(2);
 });
 it('preserves node mutation parameters, screenshot metadata, images, and JSON-quoted page names', async () => {
  const { bridge, server } = fixture(); server.sendCommand.mockResolvedValueOnce({ image: { base64: 'eA==', format: 'PNG', scale: 2, byteLength: 1 } });
  expect(await bridge.captureScreenshot()).toMatchObject({ byteLength: 1 }); server.sendCommand.mockResolvedValueOnce({ image: { format: 'SVG' } }); await bridge.captureScreenshot('a', 'SVG', 1);
  await bridge.createNode({ type: 'FRAME' }); await bridge.updateNode('n', { name: 'x' }); await bridge.updateNode('n', {}, 'revision'); await bridge.deleteNode('n'); await bridge.setSelection(['n']); await bridge.navigateTo('n');
  expect(server.sendCommand).toHaveBeenCalledWith('updateNode', { nodeId: 'n', properties: {}, expectedVersion: 'revision' }, 30000);
  const injected = 'Name";throw new Error("bad")'; await bridge.navigateToPage(injected);
  expect(server.sendCommand.mock.calls.at(-1)?.[1].code).toContain(JSON.stringify(injected));
  server.sendCommand.mockResolvedValue({ base64: 'eA==' }); expect(await bridge.getComponentImage('n')).toEqual(Buffer.from('x')); await bridge.getComponentImage('n', 'svg');
 });
 it('requires a live connection for token push and preserves source/create options', async () => {
  const { bridge, server } = fixture(); await expect(bridge.pushTokens([])).rejects.toThrow('Not connected'); server.connectedClients = [{}];
  await bridge.pushTokens([{ name: 'a', values: { default: 1 } }]); await bridge.pushTokens([], 'manual'); await bridge.pushTokens([], { createMissing: true, collectionName: 'Theme' });
  expect(server.sendCommand).toHaveBeenCalledWith('pushTokens', { tokens: [], source: 'code', createMissing: true, collectionName: 'Theme' }, 30000);
 });
});

describe('Figma evidence conversion', () => {
 it('keeps successful extraction arms when other requests fail, including complete failure', async () => {
  const onEvent = vi.fn(); const { bridge, server } = fixture({ onEvent });
  server.sendCommand.mockImplementation(async method => { if (method === 'getComponents') return [{ id: 'component', name: 'Button' }]; throw new Error('unavailable'); });
  const result = await bridge.extractDesignSystem(); expect(result.tokens).toEqual([]); expect(result.components[0]).toMatchObject({ key: 'component', variants: [], properties: {}, description: '' }); expect(result.styles).toEqual([]);
  server.sendCommand.mockRejectedValue(new Error('offline')); expect((await bridge.extractDesignSystem()).components).toEqual([]); expect(onEvent.mock.calls.some(([event]) => event.message.includes('No design system data'))).toBe(true);
 });
 it('converts variable modes, scalar types, colors and aliases without losing data', async () => {
  const { bridge, server } = fixture();
  const rows = [
   ['color','COLOR',{ r:1,g:0,b:0,a:0.5 }], ['opaque','COLOR',{ r:0,g:1,b:0 }], ['radius','FLOAT',4], ['round','FLOAT',2], ['gap','FLOAT',8], ['padding','FLOAT',12], ['margin','FLOAT',16], ['shadow','FLOAT',1], ['elevation','FLOAT',2], ['fontSize','FLOAT',14], ['textSize','FLOAT',14], ['lineHeight','FLOAT',20], ['size','FLOAT',22], ['fontFamily','STRING','Inter'], ['textStyle','STRING','body'], ['label','STRING','hello'], ['alias',undefined,{ type:'VARIABLE_ALIAS',id:'other' }], ['boolean','BOOLEAN',true], ['empty','COLOR',null],
  ];
  server.sendCommand.mockImplementation(async method => method === 'getVariables' ? { collections: [{ name: 'Theme', modes:[{modeId:'light',name:'Light'}], variables: rows.map(([name,resolvedType,value],i) => ({ id:String(i), name, resolvedType, valuesByMode:{light:value,unknown:value} })) }, {name:'Empty'}, { name:'Unset',variables:[{name:'Missing'}]}] }
    : method === 'getComponents' ? [{id:'c',name:'Button',key:'stable',description:'Action',variants:[{name:'Primary'}],componentProperties:{disabled:{type:'BOOLEAN'}}}]
    : [{id:'s',name:'Shadow',styleType:'EFFECT',value:{blur:4}}, {id:'default',name:'Fill'}]);
  const result = await bridge.extractDesignSystem(); expect(result.tokens.find(token=>token.name==='color')?.values.Light).toBe('#ff000080'); expect(result.tokens.find(token=>token.name==='opaque')?.values.unknown).toBe('#00ff00');
  expect(result.tokens.find(token=>token.name==='alias')?.values.Light).toBe('{"type":"VARIABLE_ALIAS","id":"other"}'); expect(result.tokens.find(token=>token.name==='Missing')?.values).toEqual({});
  expect(result.components[0]).toMatchObject({ key:'stable',variants:['Primary'] }); expect(result.styles).toEqual([{name:'Shadow',type:'effect',value:{blur:4}},{name:'Fill',type:'fill',value:{}}]);
 });
 it('handles empty and malformed collection arms and strips blank sticky notes', async () => {
  const { bridge, server } = fixture(); server.sendCommand.mockResolvedValue({}); const empty = await bridge.extractDesignSystem(); expect(empty.tokens).toEqual([]); expect(empty.components).toEqual([]); expect(empty.styles).toEqual([]);
  server.sendCommand.mockResolvedValueOnce(null); expect(await bridge.extractStickies()).toEqual([]);
  server.sendCommand.mockResolvedValueOnce([{id:'blank',text:'  '},{id:'plain',text:'note',x:1,y:2,width:3,height:4},{id:'color',text:'colored',fills:[{color:{r:0,g:0,b:1,a:1}}],x:0,y:0,width:1,height:1}]);
  expect(await bridge.extractStickies()).toEqual([{id:'plain',text:'note',color:undefined,position:{x:1,y:2},size:{width:3,height:4}},{id:'color',text:'colored',color:'#0000ff',position:{x:0,y:0},size:{width:1,height:1}}]);
 });
 it('converts page/section/group/component hierarchies and handles files without pages', async () => {
  const { bridge, server } = fixture(); const types = ['PAGE','SECTION','FRAME','GROUP','COMPONENT','COMPONENT_SET','INSTANCE','UNKNOWN'];
  server.sendCommand.mockResolvedValue({fileKey:'f',fileName:'Fixture',pages:[{id:'page',name:'Page',children:types.map(type=>({id:type,name:type,type}))}]});
  const ia = await bridge.extractIA('Settings'); expect(ia.entryPoints).toEqual(['page']); expect(ia.root.children?.[0].children?.map(node=>node.type)).toEqual(['page','section','frame','group','frame','frame','frame','frame']);
  await bridge.getPageTree(4); expect(server.sendCommand).toHaveBeenCalledWith('getPageTree',{depth:4},60000);
  server.sendCommand.mockResolvedValue({fileKey:'f',fileName:'Empty',pages:[]}); expect((await bridge.extractIA('Empty',3)).entryPoints).toEqual([]);
 });
});
