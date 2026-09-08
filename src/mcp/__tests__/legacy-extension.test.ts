import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { MemoireEngine } from "../../engine/core.js";
import { configureExecutionPolicy, MEMI_CAPABILITIES, resetExecutionPolicyForTests } from "../../security/execution-policy.js";
import { createMemoireMcpServer } from "../server.js";
import { registerPolicyTool } from "../policy-tools.js";

describe("legacy MCP registration scope", () => {
  it("retains the declared narrow guard for later audited extensions", async () => {
    configureExecutionPolicy({ projectRoot: process.cwd(), profile: "connected", allow: [...MEMI_CAPABILITIES] });
    const server = await createMemoireMcpServer(new MemoireEngine({ projectRoot: process.cwd() }));
    registerPolicyTool(server, { name: "local_extension", description: "Audited local extension", capabilities: [],
      inputSchema: {}, handler: async () => ({ content: [{ type: "text", text: "local result" }] }) });
    const client = new Client({ name: "extension-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await Promise.all([server.connect(a), client.connect(b)]);
      configureExecutionPolicy({ projectRoot: process.cwd() });
      const result = await client.callTool({ name: "local_extension", arguments: {} });
      expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
      expect(JSON.stringify(result.content)).toContain("local result");
    } finally {
      await client.close(); await server.close(); resetExecutionPolicyForTests();
    }
  });
});
