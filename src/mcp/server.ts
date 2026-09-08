/**
 * Mémoire MCP Server — Exposes the design intelligence engine as an
 * MCP server over stdio transport.
 *
 * Any MCP-compatible AI tool (Claude Code, Cursor, Windsurf, etc.)
 * can connect and use Mémoire's tools and resources.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { MemoireEngine } from "../engine/core.js";
import { registerReadTools, READ_TOOL_NAMES } from "./read-tools.js";
import { registerFrontendTools } from "./frontend-tools.js";
import { installPolicyToolDispatcher } from "./policy-tools.js";
import { getExecutionPolicy, MEMI_CAPABILITIES } from "../security/execution-policy.js";
import { registerResources } from "./resources.js";
import { createLogger } from "../engine/logger.js";
import { getMemoirePackageVersion } from "../utils/package-version.js";

const log = createLogger("mcp-server");

export interface McpServerOptions {
  engine: MemoireEngine;
  connectFigma?: boolean;
}

export async function createMemoireMcpServer(engine: MemoireEngine): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "memoire",
      version: getMemoirePackageVersion(),
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    },
  );

  registerResources(server, engine);
  registerReadTools(server, engine);
  registerFrontendTools(server, engine.config.projectRoot);
  // The legacy catalog spans integrations, processes and persistence. Until its
  // tools have narrower audited mappings, it requires every explicit capability.
  const legacyAllowed = MEMI_CAPABILITIES.every((capability) => getExecutionPolicy().allows(capability));
  if (legacyAllowed) {
    const { registerTools } = await import("./tools.js");
    registerTools(server, engine, READ_TOOL_NAMES);
  }
  if (!legacyAllowed) installPolicyToolDispatcher(server);

  return server;
}

export async function startStdioMcpServer(engine: MemoireEngine, connectFigma = true): Promise<void> {
  // Stdio startup must not initialize workspace, home state, queues or peers.

  // Attempt Figma connection (non-fatal — tools that need it will error clearly)
  if (connectFigma) {
    getExecutionPolicy().assert("figma", "MCP Figma bridge startup");
    getExecutionPolicy().assert("network", "MCP Figma bridge startup");
    try {
      await engine.connectFigma();
      log.info("Figma bridge started");
    } catch {
      log.info("Figma bridge not available — Figma tools will report connection errors");
    }
  }

  const server = await createMemoireMcpServer(engine);
  const transport = new StdioServerTransport();

  log.info("Starting MCP server on stdio");
  await server.connect(transport);
}
