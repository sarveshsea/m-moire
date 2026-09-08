import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MemoireEngine } from "../engine/core.js";
import { buildDesignAgentBrief, DESIGN_AGENT_BRIEF_DETAIL_LEVELS } from "../agents/design-agent-brief.js";
import { buildAppleDesignBrief, APPLE_DESIGN_BRIEF_DETAILS, APPLE_DESIGN_BRIEF_PLATFORMS } from "../ios/apple-design-brief.js";
import { getExecutionPolicy, MemiCapabilityDeniedError } from "../security/execution-policy.js";
import { registerPolicyTool } from "./policy-tools.js";

export const READ_TOOL_NAMES = new Set([
  "prepare_design_agent_brief", "prepare_apple_design_brief", "diagnose_app_quality",
]);

export async function localProjectTarget(projectRoot: string, target = "."): Promise<string> {
  if (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^[a-z]:[\\/]/i.test(target)) {
    throw new MemiCapabilityDeniedError({ profile: getExecutionPolicy().profile, capability: "network", operation: "local MCP diagnosis cannot fetch URLs" });
  }
  const root = await realpath(projectRoot);
  const resolved = await realpath(resolve(root, target));
  const child = relative(root, resolved);
  if (child === ".." || child.startsWith("../") || child.startsWith("..\\") || isAbsolute(child)) {
    throw new MemiCapabilityDeniedError({ profile: getExecutionPolicy().profile, capability: "command-mapping", operation: "MCP read outside the project root" });
  }
  return resolved;
}

export function registerReadTools(server: McpServer, engine: MemoireEngine): void {
  registerPolicyTool(server, {
    name: "prepare_design_agent_brief",
    description: "Prepare a bounded local design brief without executing commands, integrations, or models.",
    inputSchema: {
      intent: z.string().max(4000).optional(), agent: z.string().max(200).optional(),
      target: z.string().max(4096).optional(),
      detail: z.enum(DESIGN_AGENT_BRIEF_DETAIL_LEVELS).default("compact"),
      mode: z.literal("local").default("local"),
    },
    capabilities: [],
    handler: async (input, signal) => {
      const target = await localProjectTarget(engine.config.projectRoot, input.target);
      signal.throwIfAborted();
      return { content: [{ type: "text", text: JSON.stringify(buildDesignAgentBrief({
        ...input, target, projectRoot: engine.config.projectRoot,
      })) }] };
    },
  });
  registerPolicyTool(server, {
    name: "prepare_apple_design_brief",
    description: "Prepare a local Apple design brief without running Xcode or writing files.",
    inputSchema: {
      intent: z.string().max(4000).optional(), platform: z.enum(APPLE_DESIGN_BRIEF_PLATFORMS).default("ios"),
      detail: z.enum(APPLE_DESIGN_BRIEF_DETAILS).default("compact"),
    },
    capabilities: [],
    handler: async (input) => ({ content: [{ type: "text", text: JSON.stringify(buildAppleDesignBrief({
      ...input, projectRoot: engine.config.projectRoot,
    })) }] }),
  });
  registerPolicyTool(server, {
    name: "diagnose_app_quality",
    description: "Diagnose local project source without network access, command execution, or report persistence.",
    inputSchema: {
      target: z.string().max(4096).optional(), maxFiles: z.number().int().min(1).max(500).default(500),
      files: z.array(z.string().max(4096)).max(500).optional(),
    },
    capabilities: [],
    handler: async ({ target, maxFiles, files }, signal) => {
      const safeTarget = await localProjectTarget(engine.config.projectRoot, target);
      signal.throwIfAborted();
      const { diagnoseAppQuality } = await import("../app-quality/engine.js");
      const result = await diagnoseAppQuality({
        projectRoot: await realpath(engine.config.projectRoot), target: safeTarget, maxFiles, write: false, signal,
        scope: files?.length ? { files } : undefined,
      });
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    },
  });
}
