import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MemoireEngine } from "../../engine/core.js";
import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import * as scanner from "../../utils/source-scanner.js";
import { createMemoireMcpServer } from "../server.js";

describe("MCP diagnosis cancellation", () => {
  it("stops real source traversal when the active client request is cancelled", async () => {
    const root = await mkdtemp(join(tmpdir(), "memi-mcp-cancel-"));
    await writeFile(join(root, "App.tsx"), "export const App = () => <main />;");
    configureExecutionPolicy({ projectRoot: root });
    const server = await createMemoireMcpServer(new MemoireEngine({ projectRoot: root }));
    const client = new Client({ name: "diagnosis-cancel-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const abort = new AbortController();
    const actualScan = scanner.scanSourcesWithMetadata;
    let scanSignal: AbortSignal | undefined;
    let finish!: (result: unknown) => void;
    const completedScan = new Promise((resolve) => { finish = resolve; });
    vi.spyOn(scanner, "scanSourcesWithMetadata").mockImplementation(async (options) => {
      scanSignal = options.signal;
      try {
        const result = await actualScan({ ...options, excludePath: () => {
          abort.abort(new Error("Cancel actual traversal"));
          return false;
        } });
        finish(result);
        return result;
      } catch (error) {
        finish(error);
        throw error;
      }
    });
    try {
      await Promise.all([server.connect(a), client.connect(b)]);
      await expect(client.callTool({ name: "diagnose_app_quality", arguments: {} }, undefined,
        { signal: abort.signal })).rejects.toThrow("Cancel actual traversal");
      expect(scanSignal?.aborted).toBe(true);
      expect(String(await completedScan)).toContain("Cancel actual traversal");
      await expect(client.ping()).resolves.toEqual({});
    } finally {
      vi.restoreAllMocks();
      await client.close(); await server.close();
      resetExecutionPolicyForTests();
      await rm(root, { recursive: true, force: true });
    }
  });
});
