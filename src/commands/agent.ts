/**
 * Agent Command — Manage multi-Claude agent instances.
 *
 * Subcommands:
 *   memi agent spawn <role>    Spawn a new agent worker
 *   memi agent list             List all registered agents
 *   memi agent kill <id>        Kill an agent by ID
 *   memi agent status           Show agent registry status
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { AgentRole } from "../plugin/shared/contracts.js";
import { AgentWorker } from "../agents/agent-worker.js";
import { ui } from "../tui/format.js";

const VALID_ROLES: AgentRole[] = [
  "token-engineer",
  "component-architect",
  "layout-designer",
  "dataviz-specialist",
  "code-generator",
  "accessibility-checker",
  "design-auditor",
  "research-analyst",
  "general",
];

export function registerAgentCommand(program: Command, engine: MemoireEngine): void {
  const agent = program
    .command("agent")
    .description("Manage multi-Claude agent instances");

  // ── agent spawn ─────────────────────────────────────────
  agent
    .command("spawn <role>")
    .description("Spawn a new agent worker with a specific role")
    .option("-n, --name <name>", "Agent display name")
    .option("--remote", "Connect to a remote daemon via WebSocket (scans ports 9223-9232)")
    .option("--host <host>", "Daemon host for remote mode", "localhost")
    .option("--json", "Output agent info as JSON")
    .action(async (role: string, opts: { name?: string; remote?: boolean; host?: string; json?: boolean }) => {
      await engine.init();

      if (!VALID_ROLES.includes(role as AgentRole)) {
        if (opts.json) {
          console.log(JSON.stringify({ error: `Invalid role: ${role}`, validRoles: VALID_ROLES }));
          process.exitCode = 1;
          return;
        }
        console.log();
        console.log(ui.fail(`Invalid role: ${role}`));
        console.log(`  Valid roles: ${VALID_ROLES.join(", ")}`);
        console.log();
        process.exitCode = 1;
        return;
      }

      const worker = new AgentWorker({
        role: role as AgentRole,
        name: opts.name,
        mode: opts.remote ? "remote" : "in-process",
        daemonHost: opts.host,
      });

      const entry = worker.toRegistryEntry();
      await engine.agentRegistry.register(entry);
      await worker.start();

      // Broadcast registration via bridge if connected
      if (engine.figma.isConnected) {
        engine.agentBridge.broadcastRegistration(entry);
      }

      if (opts.json) {
        console.log(JSON.stringify(entry, null, 2));
      } else {
        console.log();
        console.log(ui.ok(`Agent spawned: ${entry.name} (${entry.role})`));
        console.log(ui.dots("ID", entry.id));
        console.log(ui.dots("PID", String(entry.pid)));
        console.log(ui.dots("Capabilities", entry.capabilities.join(", ")));
        console.log();
        console.log(ui.active("Agent running. Waiting for tasks..."));
        console.log();
      }

      // Graceful shutdown
      const shutdown = async () => {
        worker.stop();
        await engine.agentRegistry.deregister(entry.id);
        if (engine.figma.isConnected) {
          engine.agentBridge.broadcastDeregistration(entry.id);
        }
        if (!opts.json) {
          console.log();
          console.log(ui.ok(`Agent ${entry.name} stopped`));
          console.log();
        }
        process.exit(0);
      };

      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);

      // Keep alive
      setInterval(() => {
        engine.agentRegistry.heartbeat(entry.id);
      }, 10_000);
    });

  // ── agent list ──────────────────────────────────────────
  agent
    .command("list")
    .description("List all registered agents")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      await engine.init();

      const agents = engine.agentRegistry.getAll();

      if (opts.json) {
        console.log(JSON.stringify({ agents, count: agents.length }, null, 2));
        return;
      }

      if (agents.length === 0) {
        console.log();
        console.log(ui.pending("No agents registered"));
        console.log(`  Spawn one with: memi agent spawn <role>`);
        console.log();
        return;
      }

      console.log();
      console.log(ui.section(`AGENTS (${agents.length})`));
      for (const a of agents) {
        const statusIcon = a.status === "online" ? "+" : a.status === "busy" ? "~" : "x";
        const statusLabel = a.status === "online" ? ui.green(a.status) : a.status === "busy" ? ui.dim(a.status) : ui.red(a.status);
        console.log(`  ${statusIcon} ${a.name} (${a.role}) — ${statusLabel}`);
        console.log(`    ID: ${a.id} | PID: ${a.pid}`);
      }
      console.log();
    });

  // ── agent kill ──────────────────────────────────────────
  agent
    .command("kill <id>")
    .description("Kill an agent by ID")
    .option("--json", "Output as JSON")
    .action(async (id: string, opts: { json?: boolean }) => {
      await engine.init();

      const entry = engine.agentRegistry.get(id);
      if (!entry) {
        if (opts.json) {
          console.log(JSON.stringify({ error: `Agent ${id} not found` }));
          process.exitCode = 1;
          return;
        }
        console.log();
        console.log(ui.fail(`Agent ${id} not found`));
        console.log();
        process.exitCode = 1;
        return;
      }

      // Try to kill the process
      try {
        process.kill(entry.pid, "SIGTERM");
      } catch {
        // Process already dead
      }

      await engine.agentRegistry.deregister(id);
      if (engine.figma.isConnected) {
        engine.agentBridge.broadcastDeregistration(id);
      }

      if (opts.json) {
        console.log(JSON.stringify({ killed: id, role: entry.role, name: entry.name }));
      } else {
        console.log();
        console.log(ui.ok(`Agent ${entry.name} (${entry.role}) killed`));
        console.log();
      }
    });

  // ── agent status ────────────────────────────────────────
  agent
    .command("status")
    .description("Show agent registry and task queue status")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      await engine.init();

      const agents = engine.agentRegistry.getAll();
      const queueStats = engine.taskQueue.getStats();

      if (opts.json) {
        console.log(JSON.stringify({
          agents: {
            total: agents.length,
            online: agents.filter((a) => a.status === "online").length,
            busy: agents.filter((a) => a.status === "busy").length,
            offline: agents.filter((a) => a.status === "offline").length,
            entries: agents,
          },
          queue: queueStats,
        }, null, 2));
        return;
      }

      console.log();
      console.log(ui.section("AGENT REGISTRY"));
      console.log(ui.dots("Total", String(agents.length)));
      console.log(ui.dots("Online", String(agents.filter((a) => a.status === "online").length)));
      console.log(ui.dots("Busy", String(agents.filter((a) => a.status === "busy").length)));
      console.log();
      console.log(ui.section("TASK QUEUE"));
      console.log(ui.dots("Pending", String(queueStats.pending)));
      console.log(ui.dots("Running", String(queueStats.running)));
      console.log(ui.dots("Completed", String(queueStats.completed)));
      console.log(ui.dots("Failed", String(queueStats.failed)));
      console.log();
    });
}
