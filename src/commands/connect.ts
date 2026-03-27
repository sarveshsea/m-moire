import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import type { BridgeClient } from "../figma/ws-server.js";

import { readFile, writeFile } from "fs/promises";
import { existsSync, lstatSync } from "fs";
import { join } from "path";
import { createInterface } from "readline";

type ConfigSource = "process" | ".env.local" | ".env" | "missing";

interface ExistingConfigValue {
  value: string | null;
  source: ConfigSource;
}

interface PluginInfo {
  manifestPath: string;
  source: "home" | "local" | "missing";
  symlinked: boolean;
  exists: boolean;
}

interface ConnectJsonPayload {
  status: "needs-setup" | "connected" | "failed";
  stage: "token-check" | "bridge-start" | "wait-for-plugin";
  setup: {
    skipSetup: boolean;
    token: {
      present: boolean;
      source: ConfigSource;
    };
    fileKey: {
      present: boolean;
      source: ConfigSource;
      value: string | null;
    };
  };
  bridge: {
    port: number | null;
    connectedClients: number;
    connected: boolean;
  };
  plugin: PluginInfo;
  nextSteps: string[];
  error?: {
    message: string;
  };
}

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

/** Check process env, .env.local, and .env for a config value */
async function findExistingEnvValue(root: string, key: string): Promise<ExistingConfigValue> {
  if (process.env[key]?.trim()) {
    return {
      value: process.env[key]!.trim(),
      source: "process",
    };
  }

  for (const file of [".env.local", ".env"] as const) {
    try {
      const content = await readFile(join(root, file), "utf-8");
      const match = content.match(new RegExp(`^${key}\\s*=\\s*"?([^"\\n]+)"?`, "m"));
      if (match) {
        return {
          value: match[1].trim(),
          source: file,
        };
      }
    } catch {
      // file doesn't exist
    }
  }

  return {
    value: null,
    source: "missing",
  };
}

function resolvePluginInfo(root: string): PluginInfo {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const homePlugin = join(home, ".memoire", "plugin", "manifest.json");
  const localPlugin = join(root, "plugin", "manifest.json");

  if (existsSync(homePlugin)) {
    return {
      manifestPath: homePlugin,
      source: "home",
      symlinked: false,
      exists: true,
    };
  }

  if (existsSync(localPlugin)) {
    let symlinked = false;
    try {
      symlinked = lstatSync(localPlugin).isSymbolicLink();
    } catch {
      symlinked = false;
    }

    return {
      manifestPath: localPlugin,
      source: "local",
      symlinked,
      exists: true,
    };
  }

  return {
    manifestPath: localPlugin,
    source: "missing",
    symlinked: false,
    exists: false,
  };
}

function buildSetupPayload(
  skipSetup: boolean,
  token: ExistingConfigValue,
  fileKey: ExistingConfigValue,
): ConnectJsonPayload["setup"] {
  return {
    skipSetup,
    token: {
      present: Boolean(token.value),
      source: token.source,
    },
    fileKey: {
      present: Boolean(fileKey.value),
      source: fileKey.source,
      value: fileKey.value,
    },
  };
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

export function registerConnectCommand(program: Command, engine: MemoireEngine) {
  program
    .command("connect")
    .description("Connect to Figma — guided setup if first time")
    .option("-p, --port <port>", "Starting port to scan", "9223")
    .option("-n, --name <name>", "Instance name shown in Figma plugin")
    .option("--skip-setup", "Skip the guided setup, go straight to connecting")
    .option("--json", "Output connection state as JSON")
    .action(async (opts: { port: string; name?: string; skipSetup?: boolean; json?: boolean }) => {
      await engine.init();

      const root = engine.config.projectRoot;
      const json = Boolean(opts.json);
      const token = await findExistingEnvValue(root, "FIGMA_TOKEN");
      const fileKey = await findExistingEnvValue(root, "FIGMA_FILE_KEY");
      const plugin = resolvePluginInfo(root);

      if (json && !token.value) {
        console.log(JSON.stringify({
          status: "needs-setup",
          stage: "token-check",
          setup: buildSetupPayload(Boolean(opts.skipSetup), token, fileKey),
          bridge: {
            port: null,
            connectedClients: 0,
            connected: false,
          },
          plugin,
          nextSteps: [
            "Set FIGMA_TOKEN in .env.local, .env, or process environment",
            "Install the Memoire Figma plugin from the manifest path",
            "Run `memi connect --json --skip-setup` again after token setup",
          ],
        } satisfies ConnectJsonPayload, null, 2));
        return;
      }

      // ── Step 1: Check for Figma token ──────────────────
      if (!token.value && !opts.skipSetup) {
        console.log(`
  ┌─────────────────────────────────────────────────┐
  │  FIGMA MEMOIRE - CONNECTION SETUP                │
  │  Let's get you connected step by step.          │
  └─────────────────────────────────────────────────┘
`);

        console.log("  STEP 1 / 3 - Figma Personal Access Token\n");
        console.log("  You need a Figma token so Memoire can read your designs.\n");
        console.log("  How to get one:");
        console.log("    1. Open Figma Desktop (or figma.com)");
        console.log("    2. Click your avatar -> Settings");
        console.log("    3. Scroll to 'Personal access tokens'");
        console.log("    4. Click 'Generate new token'");
        console.log("    5. Name it 'Memoire'");
        console.log("    6. Copy the token (starts with figd_...)\n");

        const inputToken = await ask("Paste your Figma token here");

        if (!inputToken) {
          console.log("\n  No token provided. You can set it later:");
          console.log("    export FIGMA_TOKEN=\"figd_xxxxx\"");
          console.log("  Or re-run: memi connect\n");
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
        console.log("  STEP 2 / 3 - Default Figma File (optional)\n");
        console.log("  If you have one main design file, paste its URL or file key.");
        console.log("  This lets `memi pull` work without specifying a file each time.\n");
        console.log("  Example URL: figma.com/design/abc123def/MyProject");
        console.log("  Example key: abc123def\n");

        const fileInput = await ask("Figma file URL or key (Enter to skip)");

        if (fileInput) {
          const urlMatch = fileInput.match(/figma\.com\/(?:design|file)\/([^/]+)/);
          const resolvedFileKey = urlMatch ? urlMatch[1] : fileInput.trim();

          await setEnvVar(root, "FIGMA_FILE_KEY", resolvedFileKey);
          process.env.FIGMA_FILE_KEY = resolvedFileKey;
          console.log(`\n  File key saved: ${resolvedFileKey}\n`);
        } else {
          console.log("  Skipped - you can add this later in .env.local\n");
        }

        // ── Step 3: Install plugin ────────────────────────
        console.log("  STEP 3 / 3 - Install the Memoire Plugin\n");
        console.log("  The plugin runs inside Figma and talks to Memoire over WebSocket.\n");

        if (plugin.source === "local" && plugin.symlinked) {
          console.log("  Warning: plugin/manifest.json is a symlink - Figma may reject it.");
          console.log("  Run `npm install -g @sarveshsea/memoire` again to copy the plugin to ~/.memoire/plugin/\n");
        }

        console.log("  To install it:");
        console.log("    1. Open Figma Desktop");
        console.log("    2. Go to Plugins -> Development -> Import plugin from manifest");
        console.log(`    3. Select: ${plugin.manifestPath}`);
        console.log("       (In macOS file picker: Cmd+Shift+G, then paste the path)");
        console.log("    4. The plugin will appear under Plugins -> Development -> Memoire\n");

        const ready = await ask("Press Enter when ready to connect...");
        void ready;

        console.log();
      } else if (token.value) {
        if (!json) {
          console.log(`\n  Figma token found ${token.value.startsWith("figd_") ? "(figd_...)" : "(configured)"}`);
        }
        if (!process.env.FIGMA_TOKEN) {
          process.env.FIGMA_TOKEN = token.value;
        }
      }

      if (fileKey.value && !process.env.FIGMA_FILE_KEY) {
        process.env.FIGMA_FILE_KEY = fileKey.value;
      }

      // ── Start the bridge server ─────────────────────────
      if (!json) {
        console.log("  Starting Memoire bridge server...\n");
      }

      try {
        const port = await engine.connectFigma();
        const connectedClients = engine.figma.wsServer?.connectedClients?.length ?? 0;

        if (json) {
          console.log(JSON.stringify({
            status: "connected",
            stage: "wait-for-plugin",
            setup: buildSetupPayload(Boolean(opts.skipSetup), token, fileKey),
            bridge: {
              port,
              connectedClients,
              connected: connectedClients > 0,
            },
            plugin,
            nextSteps: connectedClients > 0
              ? []
              : ["Open the Memoire plugin in Figma to attach to the running bridge"],
          } satisfies ConnectJsonPayload, null, 2));
          return;
        }

        console.log(`  ┌──────────────────────────────────────────────┐`);
        console.log(`  │  MEMOIRE BRIDGE - PORT ${String(port).padEnd(22)}    │`);
        console.log(`  │                                              │`);
        console.log(`  │  In Figma:                                   │`);
        console.log(`  │    Plugins -> Development -> Memoire -> Run    │`);
        console.log(`  │    The plugin auto-connects to port ${String(port).padEnd(8)} │`);
        console.log(`  │                                              │`);
        console.log(`  │  Once connected, you can:                    │`);
        console.log(`  │    memi pull           Sync design tokens    │`);
        console.log(`  │    memi ia extract app Extract page tree     │`);
        console.log(`  │    memi sync           Full pipeline         │`);
        console.log(`  └──────────────────────────────────────────────┘\n`);

        engine.figma.on("plugin-connected", (client: BridgeClient) => {
          console.log(`  + Connected: ${client.file} (${client.editor})`);
          console.log("    Ready - run `memi pull` or `memi ia extract <name>` in another terminal.\n");
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
            console.log(`  ${ts}  x ACTION ${data.action} - ${data.error}`);
          } else {
            const size = data.result ? JSON.stringify(data.result).length : 0;
            const sizeLabel = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
            console.log(`  ${ts}  + ACTION ${data.action} - ${sizeLabel}`);
          }
        });

        engine.figma.on("sync-data", (data: { part: string; result?: unknown; error?: string }) => {
          const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          if (data.error) {
            console.log(`  ${ts}  x SYNC ${data.part} - ${data.error}`);
          } else {
            const size = data.result ? JSON.stringify(data.result).length : 0;
            const sizeLabel = size > 1024 ? `${(size / 1024).toFixed(1)}KB` : `${size}B`;
            console.log(`  ${ts}  + SYNC ${data.part} - ${sizeLabel}`);
          }
        });

        engine.figma.on("selection", (data: unknown) => {
          const nodes = (data as { nodes?: { name: string }[] })?.nodes || [];
          if (nodes.length > 0) {
            const names = nodes.map((n) => n.name).join(", ");
            console.log(`  .  SELECTION ${nodes.length} node${nodes.length > 1 ? "s" : ""} - ${names}`);
          }
        });

        engine.figma.on("page-changed", (data: { page?: string }) => {
          console.log(`  .  PAGE -> ${data.page || "unknown"}`);
        });

        process.once("SIGINT", () => {
          engine.figma.disconnect();
          process.exit(0);
        });

        console.log("  Waiting for Figma plugin... (Ctrl+C to stop)\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (json) {
          console.log(JSON.stringify({
            status: "failed",
            stage: "bridge-start",
            setup: buildSetupPayload(Boolean(opts.skipSetup), token, fileKey),
            bridge: {
              port: null,
              connectedClients: 0,
              connected: false,
            },
            plugin,
            nextSteps: [
              "Verify the Figma token and plugin manifest path",
              "Retry once the bridge port is available",
            ],
            error: {
              message,
            },
          } satisfies ConnectJsonPayload, null, 2));
          process.exitCode = 1;
          return;
        }

        console.error(`\n  Failed: ${message}\n`);
        process.exit(1);
      }
    });
}
