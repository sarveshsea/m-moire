/**
 * Registry Installer — install a component (or tokens) from a resolved
 * registry into the current project.
 *
 * Flow:
 *   1. Resolve registry (via resolver.ts)
 *   2. Fetch the component spec JSON
 *   3. Save the spec into the user's registry (.memoire/specs/components/<name>.json)
 *   4. Optionally run codegen immediately
 *   5. Install tokens file into src/styles/ if not present
 */

import { mkdir, writeFile, readFile, access } from "fs/promises";
import { join } from "path";
import type { MemoireEngine } from "../engine/core.js";
import type { ComponentSpec } from "../specs/types.js";
import { ComponentSpecSchema } from "../specs/types.js";
import { resolveRegistry, readRegistryFile, findComponentRef, type ResolvedRegistry } from "./resolver.js";

export interface InstallComponentOptions {
  /** Registry ref (npm package, github:user/repo, https://..., or local path) */
  from: string;
  /** Component name to install */
  name: string;
  /** Also install tokens.css into project */
  withTokens?: boolean;
  /** Run local codegen instead of using bundled code. Default: false (prefer bundled code). */
  regenerate?: boolean;
  /** Target directory for bundled code install. Default: src/components/memoire */
  targetDir?: string;
  /** Bypass cached npm registry packages and fetch the tarball again. */
  refresh?: boolean;
}

export interface InstallResult {
  spec: ComponentSpec;
  specPath: string;
  tokensPath?: string;
  /** Path to the installed code file (when registry bundled code, or after regenerate) */
  codePath?: string;
  generatedFiles: string[];
  source: string;
}

/**
 * Install a component from a registry into the current project.
 */
export async function installComponent(
  engine: MemoireEngine,
  opts: InstallComponentOptions,
): Promise<InstallResult> {
  const resolved = await resolveRegistry(opts.from, engine.config.projectRoot, { refresh: opts.refresh });
  const ref = findComponentRef(resolved.registry, opts.name);

  // Fetch the component spec
  const specRaw = await readRegistryFile(resolved, ref.href);
  const spec = ComponentSpecSchema.parse(JSON.parse(specRaw));

  // Stamp provenance so `memi view <Component>` can resolve the source
  // registry later without requiring --from. Non-breaking — field is optional.
  spec.__memoireSource = {
    registry: resolved.registry.name,
    version: resolved.registry.version,
    installedAt: new Date().toISOString(),
  };

  // Save into user's registry
  await engine.registry.saveSpec(spec);
  const specPath = join(engine.config.projectRoot, ".memoire", "specs", "components", `${spec.name}.json`);

  // Install tokens if requested (and not already present)
  let tokensPath: string | undefined;
  if (opts.withTokens && resolved.registry.tokens) {
    tokensPath = await installTokens(engine.config.projectRoot, resolved, resolved.registry.tokens.href);
  }

  // Install code — prefer bundled code from registry, fall back to local codegen
  const generatedFiles: string[] = [];
  let codePath: string | undefined;
  const targetDir = opts.targetDir ?? join(engine.config.projectRoot, "src", "components", "memoire");

  if (!opts.regenerate && ref.code) {
    // Bundled code in registry — write it directly
    const codeContent = await readRegistryFile(resolved, ref.code.href);
    const ext = ref.code.href.split(".").pop() || "tsx";
    await mkdir(targetDir, { recursive: true });
    codePath = join(targetDir, `${spec.name}.${ext}`);
    await writeFile(codePath, codeContent);
    generatedFiles.push(codePath);
  } else {
    // No bundled code (or --regenerate) — run local codegen
    const entryFile = await engine.generateFromSpec(spec.name);
    if (entryFile) {
      codePath = entryFile;
      generatedFiles.push(entryFile);
    }
  }

  return {
    spec,
    specPath,
    tokensPath,
    codePath,
    generatedFiles,
    source: resolved.source,
  };
}

async function installTokens(projectRoot: string, resolved: ResolvedRegistry, tokensHref: string): Promise<string> {
  const stylesDir = join(projectRoot, "src", "styles");
  await mkdir(stylesDir, { recursive: true });
  const target = join(stylesDir, "memoire-tokens.css");

  // Skip if already exists
  try {
    await access(target);
    return target;
  } catch {
    // proceed
  }

  // Fetch a .css sibling if href is .json — tokens.json → tokens.css
  const cssHref = tokensHref.replace(/\.json$/, ".css");
  const content = await readRegistryFile(resolved, cssHref).catch(() => {
    // Fallback: write a minimal import file
    return `/* Token file not found at ${cssHref} */\n`;
  });

  await writeFile(target, content);
  return target;
}

/**
 * List all components available in a registry without installing.
 */
export async function listRegistryComponents(ref: string, cwd: string = process.cwd(), options: { refresh?: boolean } = {}): Promise<{
  registry: ResolvedRegistry["registry"];
  components: { name: string; level?: string }[];
}> {
  const resolved = await resolveRegistry(ref, cwd, { refresh: options.refresh });
  return {
    registry: resolved.registry,
    components: resolved.registry.components.map(c => ({ name: c.name, level: c.level })),
  };
}
