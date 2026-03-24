import type { Command } from "commander";
import type { ArkEngine } from "../engine/core.js";
import type { BridgeClient } from "../figma/ws-server.js";
import { DashboardServer } from "../dashboard/server.js";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { createInterface } from "readline";

/** Prompt for a single line of input */
function ask(question: string, defaultVal?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultVal ? ` (${defaultVal})` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultVal || "");
    });
  });
}

/** Check if .env or .env.local exists and has FIGMA_TOKEN */
async function findExistingToken(root: string): Promise<string | null> {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = await readFile(join(root, file), "utf-8");
      const match = content.match(/^FIGMA_TOKEN\s*=\s*"?([^"\n]+)"?/m);
      if (match) return match[1].trim();
    } catch {
      // file doesn't exist
    }
  }
  return process.env.FIGMA_TOKEN || null;
}

/** Append or update a key in a .env file */
async function setEnvVar(root: string, key: string, value: string): Promise<void> {
  const envPath = join(root, ".env.local");
  let content = "";
  try {
    content = await readFile(envPath, "utf-8");
  } catch {
    // new file
  }

  const regex = new RegExp(`^${key}\\s*=.*$`, "m");
  const line = `${key}="${value}"`;

  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content.trim() + (content.trim() ? "\n" : "") + line + "\n";
  }

  await writeFile(envPath, content);
}

export function registerConnectCommand(program: Command, engine: ArkEngine) {
  program
    .command("connect")
    .description("Connect to Figma — guided setup if first time")
    .option("-p, --port <port>", "Starting port to scan", "9223")
    .option("-n, --name <name>", "Instance name shown in Figma plugin")
    .option("--skip-setup", "Skip the guided setup, go straight to connecting")
    .option("-d, --dash-port <port>", "Agent portal dashboard port", "3333")
    .action(async (opts) => {
      await engine.init();

      const root = engine.config.projectRoot;
      const token = await findExistingToken(root);

      // ── Step 1: Check for Figma token ──────────────────
      if (!token && !opts.skipSetup) {
        console.log(`
  ┌─────────────────────────────────────────────────┐
  │  FIGMA ARK — CONNECTION SETUP                   │
  │  Let's get you connected step by step.          │
  └─────────────────────────────────────────────────┘
`);

        console.log("  STEP 1 / 3 — Figma Personal Access Token\n");
        console.log("  You need a Figma token so Noche can read your designs.\n");
        console.log("  How to get one:");
        console.log("    1. Open Figma Desktop (or figma.com)");
        console.log("    2. Click your avatar → Settings");
        console.log("    3. Scroll to 'Personal access tokens'");
        console.log("    4. Click 'Generate new token'");
        console.log("    5. Name it 'Noche'");
        console.log("    6. Copy the token (starts with figd_...)\n");

        const inputToken = await ask("Paste your Figma token here");

        if (!inputToken) {
          console.log("\n  No token provided. You can set it later:");
          console.log("    export FIGMA_TOKEN=\"figd_xxxxx\"");
          console.log("  Or re-run: ark connect\n");
          process.exit(0);
        }

        // Validate token format
        if (!inputToken.startsWith("figd_") && inputToken.length < 10) {
          console.log("\n  Warning: Token doesn't look like a Figma token (usually starts with figd_).");
          const proceed = await ask("Continue anyway? (y/n)", "y");
          if (proceed.toLowerCase() !== "y") {
            process.exit(0);
          }
        }

        // Save to .env.local
        await setEnvVar(root, "FIGMA_TOKEN", inputToken);
        console.log("\n  Saved to .env.local\n");

        // Also set in current process so the bridge can use it
        process.env.FIGMA_TOKEN = inputToken;

        // ── Step 2: File key (optional) ───────────────────
        console.log("  STEP 2 / 3 — Default Figma File (optional)\n");
        console.log("  If you have one main design file, paste its URL or file key.");
        console.log("  This lets `ark pull` work without specifying a file each time.\n");
        console.log("  Example URL: figma.com/design/abc123def/MyProject");
        console.log("  Example key: abc123def\n");

        const fileInput = await ask("Figma file URL or key (Enter to skip)");

        if (fileInput) {
          // Extract file key from URL or use as-is
          const urlMatch = fileInput.match(/figma\.com\/(?:design|file)\/([^/]+)/);
          const fileKey = urlMatch ? urlMatch[1] : fileInput.trim();

          await setEnvVar(root, "FIGMA_FILE_KEY", fileKey);
          process.env.FIGMA_FILE_KEY = fileKey;
          console.log(`\n  File key saved: ${fileKey}\n`);
        } else {
          console.log("  Skipped — you can add this later in .env.local\n");
        }

        // ── Step 3: Install plugin ────────────────────────
        console.log("  STEP 3 / 3 — Install the Noche Plugin\n");
        console.log("  The plugin runs inside Figma and talks to Noche over WebSocket.\n");
        console.log("  To install it:");
        console.log("    1. Open Figma Desktop");
        console.log("    2. Go to Plugins → Development → Import plugin from manifest");
        console.log(`    3. Select: ${join(root, "plugin", "manifest.json")}`);
        console.log("    4. The plugin will appear under Plugins → Development → Noche\n");

        const ready = await ask("Press Enter when ready to connect...");
        void ready;

        console.log();
      } else if (token) {
        console.log(`\n  Figma token found ${token.startsWith("figd_") ? "(figd_...)" : "(configured)"}`);
        // Ensure it's in the process env
        if (!process.env.FIGMA_TOKEN) {
          process.env.FIGMA_TOKEN = token;
        }
      }

      // ── Start the bridge server ─────────────────────────
      console.log("  Starting Noche bridge server...\n");

      try {
        const port = await engine.connectFigma();

        console.log(`  ┌──────────────────────────────────────────────┐`);
        console.log(`  │  NOCHE BRIDGE — PORT ${String(port).padEnd(22)}    │`);
        console.log(`  │                                              │`);
        console.log(`  │  In Figma:                                   │`);
        console.log(`  │    Plugins → Development → Noche → Run       │`);
        console.log(`  │    The plugin auto-connects to port ${String(port).padEnd(8)} │`);
        console.log(`  │                                              │`);
        console.log(`  │  Once connected, you can:                    │`);
        console.log(`  │    noche pull           Sync design tokens    │`);
        console.log(`  │    noche ia extract app Extract page tree    │`);
        console.log(`  │    noche sync           Full pipeline        │`);
        console.log(`  └──────────────────────────────────────────────┘\n`);

        // Listen for plugin connections
        engine.figma.on("plugin-connected", (client: BridgeClient) => {
          console.log(`  + Connected: ${client.file} (${client.editor})`);
          console.log(`    Ready — run \`noche pull\` or \`noche ia extract <name>\` in another terminal.\n`);
        });

        engine.figma.on("plugin-disconnected", () => {
          const remaining = engine.figma.wsServer.connectedClients.length;
          console.log(`  - Plugin disconnected (${remaining} remaining)`);
        });

        engine.figma.on("chat", (data: { text: string; from: string; file: string }) => {
          console.log(`  [chat] ${data.from}: ${data.text}`);
        });

        engine.figma.on("action-result", (data: { action: string; result?: unknown; error?: string }) => {
          const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          if (data.error) {
            console.log(`  ${ts}  ✗ ACTION ${data.action} — ${data.error}`);
          } else {
            const size = data.result ? JSON.stringify(data.result).length : 0;
            const sizeLabel = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
            console.log(`  ${ts}  + ACTION ${data.action} — ${sizeLabel}`);
          }
        });

        engine.figma.on("sync-data", (data: { part: string; result?: unknown; error?: string }) => {
          const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          if (data.error) {
            console.log(`  ${ts}  ✗ SYNC ${data.part} — ${data.error}`);
          } else {
            const size = data.result ? JSON.stringify(data.result).length : 0;
            const sizeLabel = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
            console.log(`  ${ts}  + SYNC ${data.part} — ${sizeLabel}`);
          }
        });

        engine.figma.on("selection", (data: unknown) => {
          const nodes = (data as { nodes?: { name: string }[] })?.nodes || [];
          if (nodes.length > 0) {
            const names = nodes.map((n) => n.name).join(", ");
            console.log(`  .  SELECTION ${nodes.length} node${nodes.length > 1 ? "s" : ""} — ${names}`);
          }
        });

        engine.figma.on("page-changed", (data: { page?: string }) => {
          console.log(`  .  PAGE → ${data.page || "unknown"}`);
        });

        // ── Start the Agent Portal dashboard ─────────
        const dashPort = parseInt(opts.dashPort ?? "3333", 10);
        const dashboard = new DashboardServer(engine, dashPort);
        try {
          const actualDashPort = await dashboard.start();
          console.log(`  ┌──────────────────────────────────────────────┐`);
          console.log(`  │  AGENT PORTAL — http://localhost:${String(actualDashPort).padEnd(13)}│`);
          console.log(`  │  Live dashboard with real-time Figma events  │`);
          console.log(`  └──────────────────────────────────────────────┘\n`);
        } catch (dashErr) {
          const msg = dashErr instanceof Error ? dashErr.message : String(dashErr);
          console.log(`  Dashboard failed: ${msg} (continuing without it)\n`);
        }

        // Clean up on exit
        process.on("SIGINT", () => {
          dashboard.stop();
          engine.figma.disconnect();
          process.exit(0);
        });

        console.log("  Waiting for Figma plugin... (Ctrl+C to stop)\n");

      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`\n  Failed: ${message}\n`);
        process.exit(1);
      }
    });
}
