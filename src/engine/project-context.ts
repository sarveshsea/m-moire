/**
 * Project Context Detection — Scans the project to understand
 * framework, existing components, design tokens, and conventions.
 */

import { lstat, realpath, opendir } from "fs/promises";
import { join, resolve, relative, sep } from "path";
import { readContainedSource } from "../security/contained-source.js";
import { isPathWithin } from "../utils/path-containment.js";
import { z } from "zod";

export const ProjectContextSchema = z.object({
  framework: z.enum(["nextjs", "remix", "vite", "cra", "astro", "unknown"]),
  language: z.enum(["typescript", "javascript"]),
  styling: z.object({
    tailwind: z.boolean(),
    tailwindVersion: z.string().optional(),
    cssModules: z.boolean(),
    styledComponents: z.boolean(),
  }),
  shadcn: z.object({
    installed: z.boolean(),
    components: z.array(z.string()),
    config: z.record(z.unknown()).optional(),
  }),
  designTokens: z.object({
    source: z.enum(["figma", "local", "none"]),
    lastSync: z.string().optional(),
    tokenCount: z.number(),
  }),
  paths: z.object({
    components: z.string(),
    pages: z.string().optional(),
    styles: z.string().optional(),
    public: z.string().optional(),
  }),
  detectedAt: z.string(),
});

export type ProjectContext = z.infer<typeof ProjectContextSchema>;

async function fileExists(root: string, path: string): Promise<boolean> {
  try {
    const canonicalRoot = await realpath(root);
    const candidate = resolve(canonicalRoot, relative(resolve(root), path));
    const named = await lstat(candidate);
    return !named.isSymbolicLink() && (named.isDirectory() || (named.isFile() && named.nlink === 1)) &&
      isPathWithin(candidate, canonicalRoot) && await realpath(candidate) === candidate;
  } catch { return false; }
}

async function readJsonSafe(root: string, path: string): Promise<Record<string, unknown> | null> {
  try {
    const source = await readContainedSource(root, relative(root, path).split(sep).join("/"), 750_000);
    if (!source.ok) return null;
    const value: unknown = JSON.parse(source.content, (key, value) => ["__proto__", "constructor", "prototype"].includes(key) ? undefined : value);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

async function fileContains(root: string, path: string, patterns: RegExp[]): Promise<boolean> {
  const source = await readContainedSource(root, relative(root, path).split(sep).join("/"), 750_000);
  return source.ok && patterns.some(pattern => pattern.test(source.content));
}

async function componentNames(root: string, path: string): Promise<string[]> {
  if (!await fileExists(root, path)) return [];
  const names: string[] = [];
  let visited = 0;
  for await (const entry of await opendir(path)) {
    if (++visited > 500) break;
    if (!entry.isFile() || !/\.[jt]sx?$/.test(entry.name)) continue;
    const source = await readContainedSource(root, relative(root, join(path, entry.name)).split(sep).join("/"), 750_000);
    if (source.ok) names.push(entry.name.replace(/\.[jt]sx?$/, ""));
  }
  return names.sort();
}

export async function detectProject(root: string): Promise<ProjectContext> {
  root = resolve(root);
  const pkg = await readJsonSafe(root, join(root, "package.json"));
  const dependencies = (value: unknown): Record<string, string> => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {};
  const deps = { ...dependencies(pkg?.dependencies), ...dependencies(pkg?.devDependencies) };

  // Detect framework
  let framework: ProjectContext["framework"] = "unknown";
  if (deps?.next) framework = "nextjs";
  else if (deps?.["@remix-run/react"]) framework = "remix";
  else if (deps?.astro) framework = "astro";
  else if (deps?.vite || (await fileExists(root, join(root, "vite.config.ts")))) framework = "vite";
  else if (deps?.["react-scripts"]) framework = "cra";

  // Detect language
  const hasTs = await fileExists(root, join(root, "tsconfig.json"));
  const language: ProjectContext["language"] = hasTs ? "typescript" : "javascript";

  const tailwindCssFiles = [
    join(root, "src", "index.css"),
    join(root, "src", "app.css"),
    join(root, "src", "globals.css"),
    join(root, "src", "styles", "globals.css"),
    join(root, "src", "styles", "app.css"),
    join(root, "app", "globals.css"),
    join(root, "styles", "globals.css"),
    join(root, "styles", "app.css"),
    join(root, "tailwind.css"),
  ];

  const hasTailwindFromCss = (await Promise.all(
    tailwindCssFiles.map((path) => fileContains(root, path, [/@import\s+["']tailwindcss["']/, /@tailwind\b/, /@theme\b/])),
  )).some(Boolean);

  // Detect Tailwind
  const hasTailwind = !!(
    deps?.tailwindcss ||
    deps?.["@tailwindcss/vite"] ||
    (await fileExists(root, join(root, "tailwind.config.ts"))) ||
    (await fileExists(root, join(root, "tailwind.config.js"))) ||
    (await fileExists(root, join(root, "tailwind.config.mjs"))) ||
    (await fileExists(root, join(root, "tailwind.config.cjs"))) ||
    hasTailwindFromCss
  );

  let tailwindVersion: string | undefined;
  if (hasTailwind && deps?.tailwindcss) {
    tailwindVersion = deps.tailwindcss.replace(/^\^|~/, "");
  }

  // Detect shadcn
  const shadcnConfig = await readJsonSafe(root, join(root, "components.json"));
  const shadcnDirs = [
    join(root, "components", "ui"),
    join(root, "src", "components", "ui"),
  ];
  let shadcnComponents: string[] = [];

  for (const uiDir of shadcnDirs) {
    try {
      const detected = await componentNames(root, uiDir);

      if (detected.length > 0) {
        shadcnComponents = detected;
        break;
      }
    } catch {
      // ui dir doesn't exist
    }
  }

  const hasShadcn = !!shadcnConfig || shadcnComponents.length > 0;

  // Detect CSS modules / styled-components
  const hasCssModules = !!(deps?.["css-loader"] || deps?.["@vanilla-extract/css"]);
  const hasStyledComponents = !!(deps?.["styled-components"] || deps?.["@emotion/react"]);

  // Detect paths
  const componentsPath = (await fileExists(root, join(root, "src", "components")))
    ? "src/components"
    : (await fileExists(root, join(root, "components")))
      ? "components"
      : "src/components";

  const pagesPath = framework === "nextjs"
    ? (await fileExists(root, join(root, "app")))
      ? "app"
      : "pages"
    : (await fileExists(root, join(root, "src", "pages")))
      ? "src/pages"
      : undefined;

  return {
    framework,
    language,
    styling: {
      tailwind: hasTailwind,
      tailwindVersion,
      cssModules: hasCssModules,
      styledComponents: hasStyledComponents,
    },
    shadcn: {
      installed: hasShadcn,
      components: shadcnComponents,
      config: shadcnConfig ?? undefined,
    },
    designTokens: {
      source: "none",
      tokenCount: 0,
    },
    paths: {
      components: componentsPath,
      pages: pagesPath,
      public: (await fileExists(root, join(root, "public"))) ? "public" : undefined,
    },
    detectedAt: new Date().toISOString(),
  };
}
