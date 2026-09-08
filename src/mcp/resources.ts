import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoireEngine } from "../engine/core.js";
import { getExecutionPolicy } from "../security/execution-policy.js";

/** Startup resources never load unbounded legacy registry, specs, or home files. */
export function registerResources(server: McpServer, engine: MemoireEngine): void {
  server.resource("project", "memoire://project", {
    description: "Project root and execution policy. No repository or home state is loaded.",
  }, async () => ({ contents: [{
    uri: "memoire://project",
    mimeType: "application/json",
    text: JSON.stringify({ projectRoot: engine.config.projectRoot.slice(0, 4096),
      profile: getExecutionPolicy().profile,
      capabilities: getExecutionPolicy().effectiveCapabilities }),
  }] }));
}
