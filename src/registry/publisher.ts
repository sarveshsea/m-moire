/**
 * Registry Publisher — Turn a pulled Memoire design system into a
 * distributable registry package ready for `npm publish`.
 *
 * Output directory shape:
 *   <out>/
 *     package.json        (npm metadata)
 *     registry.json       (Memoire registry protocol v1)
 *     README.md
 *     tokens/
 *       tokens.json       (W3C DTCG)
 *       tokens.css        (CSS variables + Tailwind v4 @theme)
 *     components/
 *       Button.json       (ComponentSpec)
 *       Card.json
 *       ...
 */

import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { DesignSystem } from "../engine/registry.js";
import type { ComponentSpec } from "../specs/types.js";
import { exportToStyleDictionary } from "../codegen/tailwind-tokens.js";
import { generateTailwindV4Theme } from "../codegen/tailwind-v4.js";
import { generateComponent } from "../codegen/shadcn-mapper.js";
import { generateVueComponent } from "../codegen/vue-mapper.js";
import { generateSvelteComponent } from "../codegen/svelte-mapper.js";
import {
  REGISTRY_FILENAME,
  RegistrySchema,
  type Registry,
  type RegistryComponentRef,
} from "./schema.js";

export interface PublishInput {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  license?: string;
  outDir: string;
  designSystem: DesignSystem;
  specs: ComponentSpec[];
  memoireVersion: string;
  sourceFigmaUrl?: string;
  sourcePenpotFileId?: string;
  sourceDesignDocUrl?: string;
  /** Frameworks to bundle real code for. Default: ["react"]. */
  frameworks?: Array<"react" | "vue" | "svelte">;
  /** Skip bundling code (specs only). Default: false. */
  specsOnly?: boolean;
  /** Extra npm/marketplace tags for generated package metadata. */
  tags?: string[];
}

export interface PublishResult {
  outDir: string;
  registryPath: string;
  filesWritten: string[];
}

/**
 * Build a publishable registry package on disk.
 *
 * Does NOT run `npm publish` — that's the user's call after reviewing the output.
 * Returns the absolute paths of all files written.
 */
export async function publishRegistry(input: PublishInput): Promise<PublishResult> {
  const { outDir, designSystem, specs, name, version, memoireVersion } = input;
  const written: string[] = [];

  // 1. Set up directory structure
  await mkdir(outDir, { recursive: true });
  await mkdir(join(outDir, "tokens"), { recursive: true });
  if (specs.length > 0) await mkdir(join(outDir, "components"), { recursive: true });

  // 2. Write tokens
  const tokensJson = exportToStyleDictionary(designSystem.tokens);
  const tokensJsonPath = join(outDir, "tokens", "tokens.json");
  await writeFile(tokensJsonPath, JSON.stringify(tokensJson, null, 2));
  written.push(tokensJsonPath);

  const tokensCss = generateTailwindV4Theme(designSystem.tokens);
  const tokensCssPath = join(outDir, "tokens", "tokens.css");
  await writeFile(tokensCssPath, tokensCss);
  written.push(tokensCssPath);

  // 3. Write component specs + bundled code per framework
  const frameworks = input.frameworks ?? ["react"];
  const specsOnly = input.specsOnly ?? false;
  const componentRefs: RegistryComponentRef[] = [];

  if (!specsOnly && specs.length > 0) {
    await mkdir(join(outDir, "components", "code"), { recursive: true });
    for (const fw of frameworks) {
      await mkdir(join(outDir, "components", "code", fw), { recursive: true });
    }
  }

  for (const spec of specs) {
    const specPath = join(outDir, "components", `${spec.name}.json`);
    await writeFile(specPath, JSON.stringify(spec, null, 2));
    written.push(specPath);

    // Default ref (spec-only)
    const ref: RegistryComponentRef = {
      name: spec.name,
      href: `./components/${spec.name}.json`,
      level: spec.level,
      framework: specsOnly ? "agnostic" : frameworks[0],
    };

    // Bundle real code for each requested framework
    if (!specsOnly) {
      for (const fw of frameworks) {
        const { content, ext } = generateFrameworkCode(spec, fw, designSystem);
        const codePath = join(outDir, "components", "code", fw, `${spec.name}.${ext}`);
        await writeFile(codePath, content);
        written.push(codePath);

        // First framework sets the default code ref
        if (fw === frameworks[0]) {
          ref.code = {
            href: `./components/code/${fw}/${spec.name}.${ext}`,
            framework: fw,
          };
        }
      }
    }

    componentRefs.push(ref);
  }

  // 4. Write registry.json
  const registry: Registry = RegistrySchema.parse({
    $schema: "https://memoire.cv/schema/registry/v1.json",
    name,
    version,
    description: input.description,
    homepage: input.homepage,
    license: input.license ?? "MIT",
    tokens: { href: "./tokens/tokens.json", format: "w3c-dtcg" },
    components: componentRefs,
    meta: {
      sourceFigmaUrl: input.sourceFigmaUrl,
      sourcePenpotFileId: input.sourcePenpotFileId,
      sourceDesignDocUrl: input.sourceDesignDocUrl,
      extractedAt: new Date().toISOString(),
      memoireVersion,
    },
  });
  const registryPath = join(outDir, REGISTRY_FILENAME);
  await writeFile(registryPath, JSON.stringify(registry, null, 2));
  written.push(registryPath);

  // 5. Write package.json
  const pkg = {
    name,
    version,
    description: input.description ?? `Design system registry published by Memoire`,
    homepage: input.homepage,
    license: input.license ?? "MIT",
    files: ["registry.json", "tokens/", "components/", "README.md"],
    keywords: buildPackageKeywords(input, specs),
    memoire: {
      registry: true,
      schemaVersion: "v1",
      marketplaceTags: buildMarketplaceTags(input, specs),
    },
  };
  const pkgPath = join(outDir, "package.json");
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2));
  written.push(pkgPath);

  // 6. Write README
  const readmePath = join(outDir, "README.md");
  await writeFile(readmePath, buildReadme(registry, designSystem));
  written.push(readmePath);

  return { outDir, registryPath, filesWritten: written };
}

function generateFrameworkCode(
  spec: ComponentSpec,
  framework: "react" | "vue" | "svelte",
  ds: DesignSystem,
): { content: string; ext: string } {
  if (framework === "vue") {
    return { content: generateVueComponent(spec, ds.tokens).component, ext: "vue" };
  }
  if (framework === "svelte") {
    return { content: generateSvelteComponent(spec, ds.tokens).component, ext: "svelte" };
  }
  // react (default)
  const ctx = { project: { framework: "react" } as unknown as import("../engine/project-context.js").ProjectContext, designSystem: ds };
  return { content: generateComponent(spec, ctx).component, ext: "tsx" };
}

function buildReadme(registry: Registry, ds: DesignSystem): string {
  const firstComponent = registry.components[0]?.name ?? "<Component>";
  const componentRows = registry.components.length > 0
    ? registry.components.map((component) => {
      const level = component.level ?? "unknown";
      const framework = component.framework ?? "agnostic";
      return `| ${component.name} | ${level} | ${framework} |`;
    })
    : ["| None | n/a | n/a |"];

  const lines: string[] = [];
  lines.push(`# ${registry.name}`);
  lines.push("");
  lines.push(registry.description ?? "Design system registry published by Memoire.");
  lines.push("");
  lines.push(`**Version:** ${registry.version}`);
  lines.push(`**Registry protocol:** Memoire Registry v1`);
  lines.push("");
  lines.push(`## Quickstart`);
  lines.push("");
  lines.push("```bash");
  lines.push(`npm install ${registry.name}`);
  if (registry.components.length > 0) {
    lines.push(`memi add ${firstComponent} --from ${registry.name}`);
  }
  lines.push("```");
  lines.push("");
  if (registry.components.length > 0) {
    lines.push("Install tokens with the same component when you want the registry theme too:");
    lines.push("");
    lines.push("```bash");
    lines.push(`memi add ${firstComponent} --from ${registry.name} --tokens`);
    lines.push("```");
    lines.push("");
  }
  lines.push("## Available Components");
  lines.push("");
  lines.push("| Component | Atomic level | Framework |");
  lines.push("| --- | --- | --- |");
  lines.push(...componentRows);
  lines.push("");
  lines.push("## Package Contents");
  lines.push("");
  lines.push(`- **${ds.tokens.length}** design tokens`);
  lines.push(`- **${registry.components.length}** components`);
  lines.push("- `registry.json` for `memi add` and marketplace indexing");
  lines.push("- `tokens/tokens.json` in W3C DTCG format");
  lines.push("- `tokens/tokens.css` for Tailwind theme import");
  lines.push("- Component specs and generated code under `components/`");
  lines.push("");
  lines.push("## Use The Tokens Directly");
  lines.push("");
  lines.push("```css");
  lines.push(`@import "${registry.name}/tokens/tokens.css";`);
  lines.push("```");
  lines.push("");
  lines.push("## Source Metadata");
  lines.push("");
  if (registry.meta.sourceFigmaUrl) {
    lines.push(`- Figma: ${registry.meta.sourceFigmaUrl}`);
  }
  if (registry.meta.sourcePenpotFileId) {
    lines.push(`- Penpot file ID: ${registry.meta.sourcePenpotFileId}`);
  }
  if (registry.meta.sourceDesignDocUrl) {
    lines.push(`- Design doc: ${registry.meta.sourceDesignDocUrl}`);
  }
  if (!registry.meta.sourceFigmaUrl && !registry.meta.sourcePenpotFileId && !registry.meta.sourceDesignDocUrl) {
    lines.push("- Source: generated from local Memoire workspace state");
  }
  lines.push("");
  lines.push(`---`);
  lines.push(`Generated by [Memoire](https://memoire.cv) v${registry.meta.memoireVersion} on ${registry.meta.extractedAt}`);
  lines.push("");
  return lines.join("\n");
}

function buildPackageKeywords(input: PublishInput, specs: ComponentSpec[]): string[] {
  return uniqueStrings([
    "memoire-registry",
    "shadcn-registry",
    "design-system-registry",
    "design-ci",
    "design-system",
    "design-tokens",
    "tailwind",
    "shadcn",
    "ui-components",
    "installable-components",
    ...buildMarketplaceTags(input, specs),
  ]).slice(0, 40);
}

function buildMarketplaceTags(input: PublishInput, specs: ComponentSpec[]): string[] {
  return uniqueStrings([
    ...(input.tags ?? []),
    ...specs.flatMap((spec) => spec.tags ?? []),
    ...specs.map((spec) => spec.level),
    ...specs.map((spec) => spec.name.toLowerCase()),
  ].filter((value): value is string => typeof value === "string" && value.length > 0));
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
