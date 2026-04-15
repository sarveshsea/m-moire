/**
 * `memi view <component>` — open a component's page on the Memoire Marketplace.
 *
 * Resolution order for the source registry:
 *   1. A fully-qualified ref (`@scope/name/Component`) — parsed directly.
 *   2. `--from <registry>` flag.
 *   3. The local installed spec's `__memoireSource.registry` (written by `memi add`).
 *
 * Modes:
 *   - Default: open the URL in the system browser.
 *   - `--print`: print the URL to stdout, do not open.
 *   - `--json`:  emit `{ url, component, registry }`, do not open.
 */

import type { Command } from "commander";
import type { MemoireEngine } from "../engine/core.js";
import { spawn } from "node:child_process";
import { ui } from "../tui/format.js";
import { marketplaceComponentUrl } from "../registry/constants.js";
import type { ComponentSpec } from "../specs/types.js";

export interface ViewPayload {
  status: "opened" | "printed" | "failed";
  url?: string;
  component?: string;
  registry?: string;
  error?: string;
}

/**
 * Parse a possibly-qualified component reference.
 * Accepts:
 *   - "Button"                          → { component: "Button" }
 *   - "@acme/ds/Button"                 → { registry: "@acme/ds", component: "Button" }
 *   - "acme-ds/Button"                  → { registry: "acme-ds",  component: "Button" }
 */
export function parseComponentRef(ref: string): { registry?: string; component: string } {
  const trimmed = ref.trim();
  if (trimmed.startsWith("@")) {
    // Scoped package: @scope/name/Component
    const parts = trimmed.split("/");
    if (parts.length >= 3) {
      return {
        registry: `${parts[0]}/${parts[1]}`,
        component: parts.slice(2).join("/"),
      };
    }
    // Only "@scope/name" with no component — invalid here
    return { component: trimmed };
  }
  // Unscoped — only split if there's a slash
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    return {
      registry: trimmed.slice(0, slash),
      component: trimmed.slice(slash + 1),
    };
  }
  return { component: trimmed };
}

/**
 * Launch the system browser without adding a new runtime dep.
 * Uses the platform's default URL opener. Detached so the CLI can exit.
 */
export function openInBrowser(url: string): void {
  const platform = process.platform;
  const cmd = platform === "darwin" ? "open"
    : platform === "win32" ? "cmd"
    : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(cmd, args, { stdio: "ignore", detached: true });
  child.unref();
}

export function registerViewCommand(program: Command, engine: MemoireEngine) {
  program
    .command("view <component>")
    .description("Open a component's Marketplace page (memoire.cv/components/...)")
    .option("--from <registry>", "Source registry (e.g. @acme/design-system)")
    .option("--print", "Print the URL to stdout instead of opening the browser")
    .option("--json", "Emit JSON { url, component, registry } and do not open a browser")
    .action(async (componentArg: string, opts: { from?: string; print?: boolean; json?: boolean }) => {
      try {
        const parsed = parseComponentRef(componentArg);

        // Resolve registry precedence: qualified ref > --from > local spec
        let registry = parsed.registry ?? opts.from;
        const component = parsed.component;

        if (!registry) {
          // Try to read provenance from the locally-installed spec
          await engine.init();
          const spec = (await engine.registry.getSpec(component)) as ComponentSpec | null;
          const stamped = spec && spec.type === "component" ? spec.__memoireSource?.registry : undefined;
          if (stamped) {
            registry = stamped;
          } else {
            const msg = `Cannot resolve source registry for "${component}". Pass --from <registry> or use a qualified ref like @scope/name/${component}.`;
            if (opts.json) {
              console.log(JSON.stringify({ status: "failed", component, error: msg } satisfies ViewPayload));
            } else {
              console.log();
              console.log(ui.fail(msg));
              console.log();
            }
            process.exitCode = 1;
            return;
          }
        }

        const url = marketplaceComponentUrl(registry, component);

        if (opts.json) {
          const payload: ViewPayload = { status: "printed", url, component, registry };
          console.log(JSON.stringify(payload));
          return;
        }

        if (opts.print) {
          console.log(url);
          return;
        }

        openInBrowser(url);
        console.log();
        console.log(ui.ok(`Opening ${component} on Memoire Marketplace`));
        console.log(ui.dim(`  ${url}`));
        console.log();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          console.log(JSON.stringify({ status: "failed", error: msg } satisfies ViewPayload));
        } else {
          console.log();
          console.log(ui.fail(msg));
          console.log();
        }
        process.exitCode = 1;
      }
    });
}
