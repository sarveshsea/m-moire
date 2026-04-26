import type { ComponentSpec } from "../specs/types.js";
import {
  type ShadcnCssVars,
  type ShadcnRegistryFile,
  type ShadcnRegistryItem,
  type ShadcnRegistryItemType,
  ShadcnRegistryItemSchema,
  toShadcnItemName,
} from "./schema.js";

export interface ShadcnComponentCodeRef {
  path: string;
  target?: string;
  content?: string;
}

export interface ShadcnComponentItemOptions {
  code?: ShadcnComponentCodeRef;
  specPath?: string | false;
  cssVars?: ShadcnCssVars;
  registryDependencies?: string[];
  dependencies?: string[];
  devDependencies?: string[];
  sourcePackage?: string;
}

export function componentSpecToShadcnItem(
  spec: ComponentSpec,
  options: ShadcnComponentItemOptions = {},
): ShadcnRegistryItem {
  const itemName = toShadcnItemName(spec.name);
  const files: ShadcnRegistryFile[] = [];
  const code = options.code ?? {
    path: `components/code/react/${spec.name}.tsx`,
    target: defaultTargetForSpec(spec),
  };

  files.push({
    path: normalizeRelativePath(code.path),
    type: "registry:component",
    target: code.target ?? defaultTargetForSpec(spec),
    ...(code.content ? { content: code.content } : {}),
  });

  if (options.specPath !== false) {
    files.push({
      path: normalizeRelativePath(options.specPath ?? `components/${spec.name}.json`),
      type: "registry:file",
      target: `.memoire/specs/${spec.name}.json`,
    });
  }

  const item = ShadcnRegistryItemSchema.parse({
    name: itemName,
    type: atomicLevelToShadcnType(spec.level),
    title: spec.name,
    description: spec.purpose,
    registryDependencies: uniqueStrings([
      ...spec.shadcnBase.map(toShadcnDependencyName),
      ...spec.composesSpecs.map(toShadcnItemName),
      ...(options.registryDependencies ?? []),
    ]),
    dependencies: uniqueStrings(options.dependencies ?? []),
    devDependencies: uniqueStrings(options.devDependencies ?? []),
    files,
    cssVars: options.cssVars,
    categories: uniqueStrings([spec.level, ...spec.tags]),
    meta: {
      memoire: {
        source: "component-spec",
        atomicLevel: spec.level,
        specName: spec.name,
        composesSpecs: spec.composesSpecs,
        tags: spec.tags,
        variants: spec.variants,
        sourcePackage: options.sourcePackage,
      },
    },
  });

  return dropEmptyArrays(item);
}

export function componentSpecsToShadcnItems(
  specs: ComponentSpec[],
  codeRefs: Record<string, ShadcnComponentCodeRef> = {},
  options: Omit<ShadcnComponentItemOptions, "code"> = {},
): ShadcnRegistryItem[] {
  return [...specs]
    .sort((a, b) => toShadcnItemName(a.name).localeCompare(toShadcnItemName(b.name)))
    .map((spec) => componentSpecToShadcnItem(spec, {
      ...options,
      code: codeRefs[spec.name],
    }));
}

export function atomicLevelToShadcnType(level: ComponentSpec["level"]): ShadcnRegistryItemType {
  if (level === "template") return "registry:block";
  if (level === "organism") return "registry:block";
  if (level === "molecule") return "registry:component";
  return "registry:ui";
}

export function defaultTargetForSpec(spec: Pick<ComponentSpec, "name" | "level">): string {
  const fileName = `${toShadcnItemName(spec.name)}.tsx`;
  if (spec.level === "atom") return `components/ui/${fileName}`;
  if (spec.level === "molecule") return `components/molecules/${fileName}`;
  if (spec.level === "organism") return `components/organisms/${fileName}`;
  return `components/templates/${fileName}`;
}

function toShadcnDependencyName(name: string): string {
  return toShadcnItemName(name);
}

function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function dropEmptyArrays(item: ShadcnRegistryItem): ShadcnRegistryItem {
  return Object.fromEntries(
    Object.entries(item).filter(([, value]) => !(Array.isArray(value) && value.length === 0)),
  ) as ShadcnRegistryItem;
}
