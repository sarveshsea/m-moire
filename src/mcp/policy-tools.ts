import { z, type ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getExecutionPolicy, MemiCapabilityDeniedError, type MemiCapability } from "../security/execution-policy.js";

type ToolHandler = (input: unknown, signal: AbortSignal) => Promise<CallToolResult>;
const handlers = new WeakMap<McpServer, ReadonlyMap<string, ToolHandler>>();

export function toolError(error: unknown): CallToolResult {
  const detail = error instanceof MemiCapabilityDeniedError
    ? error.toJSON()
    : { code: "MEMI_TOOL_ERROR", message: error instanceof Error ? error.message : String(error) };
  return { isError: true, content: [{ type: "text", text: JSON.stringify(detail) }] };
}

/** Audited extensions explicitly declare capabilities; registration is not authorization. */
export function registerPolicyTool<Shape extends ZodRawShape>(
  server: McpServer,
  options: {
    name: string;
    description: string;
    inputSchema: Shape;
    capabilities: readonly MemiCapability[];
    handler: (input: z.output<z.ZodObject<Shape>>, signal: AbortSignal) => Promise<CallToolResult>;
  },
): void {
  const invoke: ToolHandler = async (input, signal) => {
    try {
      for (const capability of options.capabilities) getExecutionPolicy().assert(capability, `MCP tool ${options.name}`);
      signal.throwIfAborted();
      const parsed = z.object(options.inputSchema).strict().parse(input ?? {});
      const result = await options.handler(parsed, signal);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      return toolError(error);
    }
  };
  handlers.set(server, new Map([...(handlers.get(server) ?? []), [options.name, invoke]]));
  if (options.capabilities.every((capability) => getExecutionPolicy().allows(capability))) {
    server.tool(options.name, options.description, options.inputSchema as ZodRawShape,
      async (input, extra) => invoke(input, extra.signal));
  }
}

/** Preserve structured denials for direct calls to tools omitted from the locked catalog. */
export function installPolicyToolDispatcher(server: McpServer): void {
  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const handler = handlers.get(server)?.get(request.params.name);
    if (!handler) {
      return toolError(new MemiCapabilityDeniedError({ profile: getExecutionPolicy().profile, capability: "command-mapping", operation: `MCP tool ${request.params.name}` }));
    }
    return handler(request.params.arguments, extra.signal);
  });
}
