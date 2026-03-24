/**
 * Agent system — re-exports for clean imports.
 */

export { AgentOrchestrator, classifyIntent } from "./orchestrator.js";
export type {
  IntentCategory,
  AgentPlan,
  SubTask,
  SubAgentType,
  AgentContext,
  AgentExecutionResult,
  DesignMutation,
} from "./orchestrator.js";

export { AGENT_PROMPTS } from "./prompts.js";
