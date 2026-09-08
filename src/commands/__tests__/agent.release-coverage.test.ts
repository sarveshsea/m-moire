import { Command } from 'commander';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { registerAgentCommand } from '../agent.js';
const fx = vi.hoisted(() => ({ install: vi.fn(), start: vi.fn(), stop: vi.fn(), worker: vi.fn(), brief: vi.fn() }));
vi.mock('../../agents/agent-worker.js', () => ({ AgentWorker: class { constructor(options: unknown) { fx.worker(options); } start = fx.start; stop = fx.stop; toRegistryEntry() { return { id: 'worker', name: 'Worker', role: 'general', pid: 123456, capabilities: ['read'] }; } } }));
vi.mock('../../agents/agent-kits.js', () => ({ AGENT_INSTALL_TARGETS: ['universal'], normalizeAgentInstallTarget: (value?: string) => value ?? 'all', installAgentKits: fx.install }));
vi.mock('../../agents/design-agent-brief.js', () => ({ buildDesignAgentBrief: fx.brief, normalizeDesignAgentBriefMode: (mode: string) => mode, normalizeDesignAgentBriefDetail: (detail: string) => detail }));
let engine: any, logs: string[], shutdown: (() => Promise<void>) | undefined, heartbeat: (() => void) | undefined;
async function run(...args: string[]) { const p = new Command(); registerAgentCommand(p, engine); await p.parseAsync(['agent', ...args], { from: 'user' }); }
const entry = (status: string, age: number) => ({ id: status + age, name: status, role: 'general', status, pid: 123456, lastHeartbeat: Date.now() - age });
beforeEach(() => {
  logs = []; shutdown = undefined; heartbeat = undefined; vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation((...args) => { logs.push(args.join(' ')); });
  engine = { config: { projectRoot: '/synthetic/project' }, init: vi.fn(), figma: { isConnected: false }, agentRegistry: { register: vi.fn(), deregister: vi.fn(), heartbeat: vi.fn(), getAll: vi.fn(() => []), get: vi.fn() }, agentBridge: { broadcastRegistration: vi.fn(), broadcastDeregistration: vi.fn() }, taskQueue: { getStats: () => ({ pending: 1, running: 2, completed: 3, failed: 4 }) } };
  fx.brief.mockReturnValue({ agent: 'codex', mode: 'local', detail: 'compact', target: '.', intent: 'Review', evidenceCommands: [{ command: 'memi diagnose', why: 'evidence', cost: 'low' }], designRules: ['Reuse'], handoffChecklist: ['Verify'] });
  fx.install.mockResolvedValue({ status: 'planned', suiteManifest: { destination: '/fixture/suite' }, plans: [{ target: 'universal', kind: 'skill', destination: '/fixture/skill', exists: true, note: 'Review' }, { target: 'codex', kind: 'mcp', destination: '/fixture/mcp', exists: false, note: 'New' }] });
});
afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
function interceptLifetime() {
  vi.spyOn(process, 'once').mockImplementation(((name: string, callback: () => Promise<void>) => { if (name === 'SIGTERM') shutdown = callback; return process; }) as never);
  vi.spyOn(globalThis, 'setInterval').mockImplementation(((callback: () => void) => { heartbeat = callback; return 1; }) as never);
  vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
}
describe('agent command presentation and lifecycle effects', () => {
  it.each([false, true])('returns useful briefs and reports failures json=%s', async json => {
    await run('brief', '.', '--project', '/fixture', ...(json ? ['--json'] : []));
    expect(fx.brief).toHaveBeenCalledWith(expect.objectContaining({ projectRoot: '/fixture', target: '.' }));
    expect(logs.join('\n')).toContain(json ? '"intent"' : 'Reuse');
    fx.brief.mockImplementationOnce(() => { throw 'brief unavailable'; }); await run('brief', ...(json ? ['--json'] : [])); expect(logs.join('\n')).toContain('brief unavailable'); expect(process.exitCode).toBe(1);
  });
  it.each([false, true])('plans and reports installs without invented success json=%s', async json => {
    await run('install', '--dry-run', ...(json ? ['--json'] : [])); expect(fx.install).toHaveBeenCalledWith(expect.objectContaining({ target: 'all', dryRun: true }));
    fx.install.mockResolvedValueOnce({ status: 'installed', suiteManifest: { destination: '/suite' }, plans: [] }); await run('install', 'universal', '--project', '/fixture', ...(json ? ['--json'] : []));
    expect(logs.join('\n')).toContain('installed'); fx.install.mockRejectedValueOnce(new Error('write denied')); await run('install', ...(json ? ['--json'] : [])); expect(process.exitCode).toBe(1); expect(logs.join('\n')).toContain('write denied');
  });
  it.each([false, true])('rejects invalid worker roles before spawning json=%s', async json => {
    await run('spawn', 'invalid', ...(json ? ['--json'] : [])); expect(process.exitCode).toBe(1); expect(fx.worker).not.toHaveBeenCalled(); expect(logs.join('\n')).toContain('Invalid role');
  });
  it.each([false, true])('registers, heartbeats and shuts down a worker with json=%s', async json => {
    interceptLifetime(); engine.figma.isConnected = json;
    await run('spawn', 'general', '--name', 'Worker', ...(json ? ['--remote', '--json'] : []));
    expect(fx.worker).toHaveBeenCalledWith(expect.objectContaining({ mode: json ? 'remote' : 'in-process' }));
    expect(engine.agentRegistry.register).toHaveBeenCalledOnce(); expect(fx.start).toHaveBeenCalledOnce(); heartbeat!(); expect(engine.agentRegistry.heartbeat).toHaveBeenCalledWith('worker');
    await shutdown!(); expect(fx.stop).toHaveBeenCalledOnce(); expect(engine.agentRegistry.deregister).toHaveBeenCalledWith('worker');
    expect(engine.agentBridge.broadcastDeregistration).toHaveBeenCalledTimes(json ? 1 : 0);
  });
  it('lists empty and mixed agent statuses and derives heartbeat ages', async () => {
    await run('list'); expect(logs.join('\n')).toContain('No agents'); await run('status');
    engine.agentRegistry.getAll.mockReturnValue([entry('online', 10), entry('busy', 2000), entry('offline', 90000), entry('offline', 7200000)]);
    await run('list'); await run('list', '--json'); expect(JSON.parse(logs.at(-1)!)).toHaveProperty('count', 4);
    await run('status', '--json'); expect(JSON.parse(logs.at(-1)!)).toMatchObject({ agents: { total: 4, online: 1, busy: 1, offline: 2 }, queue: { failed: 4 } });
    await run('status'); expect(logs.join('\n')).toContain('stale'); expect(logs.join('\n')).toContain('2h');
  });
  it.each([false, true])('handles absent, live and already-dead worker termination json=%s', async json => {
    const kill = vi.spyOn(process, 'kill').mockReturnValue(true); await run('kill', 'missing', ...(json ? ['--json'] : [])); expect(kill).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
    engine.agentRegistry.get.mockReturnValue(entry('online', 1)); engine.figma.isConnected = json;
    await run('kill', 'worker', ...(json ? ['--json'] : [])); expect(kill).toHaveBeenCalledWith(123456, 'SIGTERM');
    kill.mockImplementationOnce(() => { throw new Error('already dead'); }); await run('kill', 'worker', ...(json ? ['--json'] : [])); expect(engine.agentRegistry.deregister).toHaveBeenCalledTimes(2);
  });
});
