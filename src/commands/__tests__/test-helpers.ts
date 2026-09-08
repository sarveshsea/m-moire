/**
 * Shared test helpers for CLI command tests.
 *
 * Eliminates duplicated captureLogs/lastLog/writePluginBundle across 14+ test files.
 */

import { vi } from "vitest";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

/** Capture console and awaited JSON stdout writes. Silences console.error. */
export function captureLogs(): string[] {
  const logs: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.join(" "));
  });
  vi.spyOn(process.stdout, "write").mockImplementation(((chunk: unknown, callback?: (error?: Error | null) => void) => {
    logs.push(String(chunk).replace(/\n$/, ""));
    callback?.();
    return true;
  }) as typeof process.stdout.write);
  vi.spyOn(console, "error").mockImplementation(() => {});
  return logs;
}

/** Get the last console.log output. Throws if no output captured. */
export function lastLog(logs: string[]): string {
  const value = logs.at(-1);
  if (!value) throw new Error("Expected a console.log call");
  return value;
}

/** Write a minimal plugin bundle for tests that need plugin file structure. */
export async function writePluginBundle(
  pluginRoot: string,
  meta: { packageVersion?: string; widgetVersion?: string } = {},
): Promise<void> {
  await mkdir(pluginRoot, { recursive: true });
  await writeFile(join(pluginRoot, "manifest.json"), JSON.stringify({ name: "memoire-plugin" }), "utf-8");
  await writeFile(join(pluginRoot, "code.js"), "console.log('widget');\n", "utf-8");
  await writeFile(join(pluginRoot, "ui.html"), "<html><body>Operator Console</body></html>\n", "utf-8");
  await writeFile(join(pluginRoot, "widget-meta.json"), JSON.stringify({
    widgetVersion: meta.widgetVersion ?? "2",
    packageVersion: meta.packageVersion ?? "0.6.0",
    builtAt: "2026-03-27T10:00:00.000Z",
    bundleHash: "bundle-hash",
    manifest: { path: join(pluginRoot, "manifest.json"), sha256: "m-hash" },
    code: { path: join(pluginRoot, "code.js"), sha256: "c-hash" },
    ui: { path: join(pluginRoot, "ui.html"), sha256: "u-hash" },
  }), "utf-8");
}
