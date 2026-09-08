import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemoireEngine } from "../../engine/core.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { createMemoireMcpServer, startStdioMcpServer } from "../server.js";

const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  resetExecutionPolicyForTests();
  vi.restoreAllMocks();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "memi-locked-mcp-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "App.tsx"), 'export const App = () => <button>Save</button>;');
  configureExecutionPolicy({ projectRoot: root });
  const engine = new MemoireEngine({ projectRoot: root });
  return { root, engine };
}

async function connect(engine: MemoireEngine) {
  const server = await createMemoireMcpServer(engine);
  const client = new Client({ name: "locked-test", version: "1" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  cleanups.push(() => server.close());
  cleanups.push(() => client.close());
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("locked MCP read surface", () => {
  it("starts stdio without workspace initialization or eager integration startup", async () => {
    const { engine } = await fixture();
    const init = vi.spyOn(engine, "init").mockResolvedValue();
    const figma = vi.spyOn(engine, "connectFigma").mockResolvedValue(undefined as never);
    vi.spyOn(McpServer.prototype, "connect").mockResolvedValue();
    await startStdioMcpServer(engine, false);
    expect(init).not.toHaveBeenCalled();
    expect(figma).not.toHaveBeenCalled();
  });

  it("lists only audited local tools and performs useful calls without writing state", async () => {
    const { engine, root } = await fixture();
    const before = await readdir(root);
    const client = await connect(engine);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "diagnose_app_quality", "prepare_apple_design_brief", "prepare_design_agent_brief",
    ]);
    for (const name of ["prepare_design_agent_brief", "diagnose_app_quality"]) {
      const result = await client.callTool({ name, arguments: {} });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain(name === "diagnose_app_quality" ? "issues" : "mission");
    }
    const denied = await client.callTool({ name: "design_doc", arguments: { url: "https://example.com" } });
    expect(denied.isError).toBe(true);
    expect(await readdir(root)).toEqual(before);
  });

  it("rejects URL diagnosis and out-of-project file reads before performing work", async () => {
    const { engine } = await fixture();
    const client = await connect(engine);
    for (const target of ["https://example.com", tmpdir()]) {
      const result = await client.callTool({ name: "diagnose_app_quality", arguments: { target } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("MEMI_CAPABILITY_DENIED");
    }
  });

  it("exposes bounded project metadata without legacy registry or spec resources", async () => {
    const { engine } = await fixture();
    const client = await connect(engine);
    const resources = await client.listResources();
    expect(resources.resources.map((resource) => resource.uri)).toEqual(["memoire://project"]);
    expect((await client.listResourceTemplates()).resourceTemplates).toEqual([]);
    const resource = await client.readResource({ uri: "memoire://project" });
    expect(JSON.stringify(resource.contents)).toContain('locked');
  });
});
