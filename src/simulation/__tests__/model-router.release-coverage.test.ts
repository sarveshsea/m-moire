import { beforeEach, describe, expect, it, vi } from "vitest";
import { SimulationModelRouter } from "../model-router.js";
import { SimulationBudgetSchema } from "../types.js";

const ports = vi.hoisted(() => ({ spawn: vi.fn(), exists: vi.fn() }));
vi.mock("node:child_process", () => ({ spawnSync: ports.spawn }));
vi.mock("node:fs", () => ({ existsSync: ports.exists }));
const stamp = "2026-09-08T10:00:00.000Z";
function setup(env: NodeJS.ProcessEnv = {}) {
  const fetcher = vi.fn();
  const router = new SimulationModelRouter({ env, now: () => stamp, resolveCommand: name => `/synthetic/${name}`, fetchImpl: fetcher });
  return { router, fetcher, profiles: router.listProfiles() };
}
const request = (allowLiveModels = true) => ({ prompt: "Inspect a button", system: "Use evidence", budget: SimulationBudgetSchema.parse({ allowLiveModels }), cwd: "/synthetic" });
beforeEach(() => { vi.clearAllMocks(); ports.spawn.mockReturnValue({ status: 0, stdout: "A useful response", stderr: "" }); ports.exists.mockReturnValue(false); });

describe("simulation router observable execution contracts", () => {
  it("prefers explicit provider configuration and retains the deterministic option", () => {
    const { profiles } = setup({ OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "https://fixture.invalid/v1/", OPENAI_MODEL: "fixture-model", CODEX_MODEL: "fixture-codex", CODEX_REASONING_EFFORT: "low", CLAUDE_MODEL: "fixture-claude", OLLAMA_MODEL: "fixture-local", ANTHROPIC_API_KEY: "fixture", ANTHROPIC_MODEL: "fixture-anthropic" });
    expect(profiles.every(profile => profile.available)).toBe(true);
    expect(profiles.map(profile => profile.model)).toEqual(["fixture-codex", "fixture-claude", "fixture-local", "fixture-model", "fixture-anthropic", "memoire-clean-room-v2"]);
  });
  it("accepts the compatible provider alias environment", () => {
    const { profiles } = setup({ LLM_API_KEY: "fixture", LLM_BASE_URL: "https://fixture.invalid", LLM_MODEL_NAME: "alias" });
    expect(profiles.find(profile => profile.provider === "openai-compatible")).toMatchObject({ model: "alias", available: true });
  });
  it.each(["codex", "claude-code", "ollama"])("executes the %s argument vector without a shell", async provider => {
    const { router, profiles } = setup();
    const result = await router.execute(profiles.find(profile => profile.provider === provider)!, request());
    expect(result.transcript).toMatchObject({ response: "A useful response", fallback: false });
    expect(ports.spawn).toHaveBeenCalledWith(expect.stringContaining("/synthetic/"), expect.arrayContaining(["Inspect a button"]), expect.objectContaining({ shell: false, cwd: "/synthetic", timeout: 120_000, maxBuffer: 4_000_000 }));
  });
  it.each([
    ['{"content":"direct"}', "direct"],
    ['{"message":{"content":"nested"}}', "nested"],
    ['{"text":"text"}', "text"],
    ['{"content":1}\n{"type":"done"}\nplain', '{"content":1}\n{"type":"done"}\nplain'],
    ['{"text":"earlier"}\n{"content":" "}', "earlier"],
    ['null\nnot json', 'null\nnot json'],
  ])("extracts usable response text from CLI output %s", async (stdout, expected) => {
    const { router, profiles } = setup();
    ports.spawn.mockReturnValue({ status: 0, stdout, stderr: null });
    expect((await router.execute(profiles[0], request())).transcript.response).toBe(expected);
  });
  it.each([{ status: 1, stdout: "", stderr: "provider unavailable" }, { status: null, stdout: null, stderr: null }])("records CLI failures and returns an explicit fallback", async value => {
    const { router, profiles } = setup(); ports.spawn.mockReturnValue(value);
    const result = await router.execute(profiles[0], request());
    expect(result.transcript.fallback).toBe(true);
    expect(result.providerRun.error).toBe(value.stderr || "Command exited with null");
  });
  it.each([new Error("launch failed"), "launch failed"])("contains execution exceptions: %s", async error => {
    const { router, profiles } = setup(); ports.spawn.mockImplementation(() => { throw error; });
    expect((await router.execute(profiles[0], request())).providerRun.error).toBe("launch failed");
  });
  it("honors disabled live execution and preserves supplied evidence identity", async () => {
    const { router, profiles, fetcher } = setup();
    const result = await router.execute(profiles[0], { ...request(false), prompt: "", runId: "run-a", scenarioId: "scenario-a", roundId: "round-a", agentId: "agent-a", evidenceFindingIds: ["finding-a"] });
    expect(result.transcript).toMatchObject({ fallback: true, runId: "run-a", scenarioId: "scenario-a", roundId: "round-a", agentId: "agent-a", evidenceFindingIds: ["finding-a"] });
    expect(result.transcript.response).toContain("the scenario");
    expect(ports.spawn).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not invoke unavailable or deterministic profiles", async () => {
    const { router, profiles } = setup();
    await router.execute({ ...profiles[0], available: false }, request());
    await router.execute(profiles.find(profile => profile.provider === "deterministic")!, request());
    expect(ports.spawn).not.toHaveBeenCalled();
  });
  it("validates the budget before invoking any provider", async () => {
    const { router, profiles } = setup();
    await expect(router.execute(profiles[0], { ...request(), budget: { ...request().budget, maxWallTimeMs: -1 } })).rejects.toThrow();
    expect(ports.spawn).not.toHaveBeenCalled();
  });
  it.each([undefined, { prompt_tokens: 12, completion_tokens: 8 }])("records compatible provider usage when supplied: %j", async usage => {
    const { router, profiles, fetcher } = setup({ LLM_API_KEY: "fixture", LLM_BASE_URL: "https://fixture.invalid/v1///" });
    fetcher.mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: "Use the mapped button" } }], usage }), { status: 200 }));
    const result = await router.execute(profiles[3], request());
    expect(result.transcript).toMatchObject({ response: "Use the mapped button", fallback: false });
    expect(result.providerRun.usage.inputTokens).toBe(usage?.prompt_tokens ?? 5);
    expect(result.providerRun.usage.outputTokens).toBe(usage?.completion_tokens ?? 6);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://fixture.invalid/v1/chat/completions");
    expect(JSON.parse(init.body).messages).toEqual([{ role: "system", content: "Use evidence" }, { role: "user", content: "Inspect a button" }]);
  });
  it.each([{}, { choices: [] }, { choices: [{}] }, { choices: [{ message: {} }] }])("reports missing compatible response content: %j", async payload => {
    const { router, profiles, fetcher } = setup({ OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "https://fixture.invalid" });
    fetcher.mockResolvedValue(new Response(JSON.stringify(payload)));
    const result = await router.execute(profiles[3], request());
    expect(result.transcript.fallback).toBe(true);
    expect(result.providerRun.error).toBe("OpenAI-compatible response had no message content");
  });
  it("reports provider HTTP and transport failures without losing fallback labeling", async () => {
    const { router, profiles, fetcher } = setup({ OPENAI_API_KEY: "fixture", OPENAI_BASE_URL: "https://fixture.invalid" });
    fetcher.mockResolvedValueOnce(new Response("failure", { status: 429 }));
    expect((await router.execute(profiles[3], request())).providerRun.error).toContain("429");
    fetcher.mockRejectedValueOnce(new Error("offline"));
    expect((await router.execute(profiles[3], request())).providerRun.error).toBe("offline");
  });
  it("denies missing credentials even if a previously captured profile was available", async () => {
    const { router, profiles, fetcher } = setup();
    const result = await router.execute({ ...profiles[3], available: true, baseUrl: "https://fixture.invalid" }, request());
    expect(result.providerRun.error).toContain("key or base URL missing");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("clamps latency against a backwards clock and respects shorter CLI deadlines", async () => {
    const now = vi.fn().mockReturnValueOnce(stamp).mockReturnValueOnce("2026-09-08T09:00:00.000Z");
    const router = new SimulationModelRouter({ env: {}, resolveCommand: () => "/synthetic/codex", now });
    const result = await router.execute(router.listProfiles()[0], { ...request(), budget: { ...request().budget, maxWallTimeMs: 5000 } });
    expect(result.providerRun.latencyMs).toBe(0);
    expect(ports.spawn.mock.calls[0][2].timeout).toBe(5000);
  });
  it("resolves default command discovery through filesystem probes without executing commands", () => {
    ports.exists.mockImplementation((path: string) => path.endsWith("/codex") || path.endsWith("\\codex"));
    const profiles = new SimulationModelRouter({ env: {} }).listProfiles();
    expect(profiles[0].available).toBe(true); expect(profiles[1].available).toBe(false);
    expect(ports.spawn).not.toHaveBeenCalled();
  });
});
