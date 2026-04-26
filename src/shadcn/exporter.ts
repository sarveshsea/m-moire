import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { generateComponent } from "../codegen/shadcn-mapper.js";
import type { DesignSystem } from "../engine/registry.js";
import type { ComponentSpec } from "../specs/types.js";
import { componentSpecToShadcnItem, defaultTargetForSpec } from "./mapper.js";
import {
  SHADCN_REGISTRY_SCHEMA_URL,
  type ShadcnRegistry,
  type ShadcnRegistryItem,
  ShadcnRegistryItemSchema,
  ShadcnRegistrySchema,
  parseShadcnRegistry,
  parseShadcnRegistryItem,
  toShadcnItemName,
} from "./schema.js";
import { designTokensToShadcnCssVars } from "./tokens.js";

export interface ShadcnRegistryExportInput {
  name: string;
  outDir: string;
  designSystem: DesignSystem;
  specs: ComponentSpec[];
  homepage?: string;
  memoireVersion?: string;
  sourcePackage?: string;
  generatedAt?: string;
}

export interface ShadcnRegistryExportResult {
  outDir: string;
  registryPath: string;
  filesWritten: string[];
  itemRoutes: Record<string, string>;
  registry: ShadcnRegistry;
}

export interface ShadcnDoctorCheck {
  name: string;
  status: "passed" | "failed";
  message?: string;
}

export interface ShadcnDoctorResult {
  status: "passed" | "failed";
  outDir: string;
  checks: ShadcnDoctorCheck[];
  itemCount: number;
  errors: string[];
}

export function buildShadcnRegistry(input: Omit<ShadcnRegistryExportInput, "outDir">): ShadcnRegistry {
  const cssVars = designTokensToShadcnCssVars(input.designSystem.tokens);
  const hasCssVars = Object.keys(cssVars).length > 0;
  const themeName = "memoire-theme";
  const items: ShadcnRegistryItem[] = [];

  if (hasCssVars) {
    items.push(ShadcnRegistryItemSchema.parse({
      name: themeName,
      type: "registry:theme",
      title: "Memoire Theme",
      description: "Design tokens exported from the current Memoire workspace.",
      cssVars,
      categories: ["theme", "tokens", "tailwind"],
      meta: {
        memoire: {
          source: "design-system-tokens",
          tokenCount: input.designSystem.tokens.length,
          itemRoute: shadcnItemFileRoute(themeName),
        },
      },
    }));
  }

  const componentItems = [...input.specs]
    .sort((a, b) => toShadcnItemName(a.name).localeCompare(toShadcnItemName(b.name)))
    .map((spec) => {
      const itemName = toShadcnItemName(spec.name);
      const generated = generateComponent(spec, {
        project: { framework: "react" } as unknown as import("../engine/project-context.js").ProjectContext,
        designSystem: input.designSystem,
      }).component;

      return componentSpecToShadcnItem(spec, {
        code: {
          path: `registry/${itemName}/${itemName}.tsx`,
          target: defaultTargetForSpec(spec),
          content: generated,
        },
        registryDependencies: hasCssVars ? [themeName] : [],
        sourcePackage: input.sourcePackage,
      });
    });

  items.push(...componentItems);

  return ShadcnRegistrySchema.parse({
    $schema: SHADCN_REGISTRY_SCHEMA_URL,
    name: sanitizeRegistryName(input.name),
    homepage: input.homepage,
    items: items.map((item) => withItemRoute(item)),
    meta: {
      memoire: {
        protocol: "shadcn-v2",
        generatedAt: input.generatedAt ?? new Date().toISOString(),
        memoireVersion: input.memoireVersion,
        sourcePackage: input.sourcePackage,
      },
    },
  });
}

export async function exportShadcnRegistry(input: ShadcnRegistryExportInput): Promise<ShadcnRegistryExportResult> {
  await mkdir(input.outDir, { recursive: true });

  const registry = buildShadcnRegistry(input);
  const filesWritten: string[] = [];
  const itemRoutes: Record<string, string> = {};

  for (const item of registry.items) {
    const itemName = toShadcnItemName(item.name);
    const itemPath = join(input.outDir, `${itemName}.json`);
    await writeFile(itemPath, `${JSON.stringify(item, null, 2)}\n`);
    filesWritten.push(itemPath);
    itemRoutes[item.name] = shadcnItemFileRoute(itemName);
  }

  const registryIndex = {
    ...registry,
    items: registry.items.map(stripFileContent),
  };
  const registryPath = join(input.outDir, "registry.json");
  await writeFile(registryPath, `${JSON.stringify(registryIndex, null, 2)}\n`);
  filesWritten.unshift(registryPath);

  return { outDir: input.outDir, registryPath, filesWritten, itemRoutes, registry };
}

export async function doctorShadcnRegistryOutput(outDir: string): Promise<ShadcnDoctorResult> {
  const checks: ShadcnDoctorCheck[] = [];
  const errors: string[] = [];
  let itemCount = 0;

  try {
    const registryPath = join(outDir, "registry.json");
    const registry = parseShadcnRegistry(JSON.parse(await readFile(registryPath, "utf8")));
    checks.push({ name: "registry.json", status: "passed", message: `${registry.name} (${registry.items.length} items)` });
    itemCount = registry.items.length;

    for (const item of registry.items) {
      const itemPath = join(outDir, `${toShadcnItemName(item.name)}.json`);
      try {
        const parsed = parseShadcnRegistryItem(JSON.parse(await readFile(itemPath, "utf8")));
        checks.push({ name: `item:${parsed.name}`, status: "passed", message: `${parsed.files.length} file refs` });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        checks.push({ name: `item:${item.name}`, status: "failed", message });
        errors.push(message);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ name: "registry.json", status: "failed", message });
    errors.push(message);
  }

  return {
    status: errors.length === 0 ? "passed" : "failed",
    outDir,
    checks,
    itemCount,
    errors,
  };
}

export function shadcnItemFileRoute(name: string): string {
  return `/r/${toShadcnItemName(name)}.json`;
}

function withItemRoute(item: ShadcnRegistryItem): ShadcnRegistryItem {
  return ShadcnRegistryItemSchema.parse({
    ...item,
    meta: {
      ...(item.meta ?? {}),
      memoire: {
        ...((item.meta?.memoire as Record<string, unknown> | undefined) ?? {}),
        itemRoute: shadcnItemFileRoute(item.name),
      },
    },
  });
}

function stripFileContent(item: ShadcnRegistryItem): ShadcnRegistryItem {
  return ShadcnRegistryItemSchema.parse({
    ...item,
    files: item.files.map(({ content: _content, ...file }) => file),
  });
}

function sanitizeRegistryName(name: string): string {
  return name.replace(/^@/, "").replace(/\//g, "-").replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase();
}
