/**
 * Memoire Registry Protocol — v1 compatibility schema
 *
 * A registry is a versioned, distributable design system package. It bundles
 * design tokens, component specs, and optional generated code into a shape
 * any project can consume via `memi add <component> --from <registry>`.
 *
 * Distribution channels: npm packages, GitHub repos, raw HTTPS URLs.
 *
 * New code should import this through `src/registry/legacy.ts` so V1 remains
 * clearly separated from shadcn-native V2 registry output.
 */

import { z } from "zod";

// ── Schema ────────────────────────────────────────────────────

export const REGISTRY_SCHEMA_VERSION = "v1";
export const REGISTRY_FILENAME = "registry.json";

export const RegistryTokenRefSchema = z.object({
  href: z.string().describe("Relative path to tokens file (e.g. ./tokens/tokens.json)"),
  format: z.enum(["w3c-dtcg", "style-dictionary", "css-vars"]).default("w3c-dtcg"),
});

export const RegistryComponentRefSchema = z.object({
  name: z.string().describe("Component name — must be a valid TS identifier"),
  href: z.string().describe("Relative path to component spec (.json)"),
  level: z.enum(["atom", "molecule", "organism", "template"]).optional(),
  framework: z.enum(["react", "vue", "svelte", "agnostic"]).default("agnostic"),
  /** Optional pre-generated code for this component */
  code: z.object({
    href: z.string(),
    framework: z.enum(["react", "vue", "svelte"]),
  }).optional(),
});

export const RegistryMetaSchema = z.object({
  sourceFigmaUrl: z.string().optional(),
  sourcePenpotFileId: z.string().optional(),
  sourceDesignDocUrl: z.string().optional(),
  extractedAt: z.string().describe("ISO 8601 timestamp"),
  memoireVersion: z.string(),
});

export const RegistrySchema = z.object({
  $schema: z.string().default("https://memoire.cv/schema/registry/v1.json"),
  /** npm-style package name — scoped or unscoped */
  name: z.string().min(1).max(214).regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, {
    message: "Must be a valid npm package name",
  }),
  version: z.string().regex(/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/, {
    message: "Must be a valid semver string (e.g. 1.0.0)",
  }),
  description: z.string().max(500).optional(),
  homepage: z.string().url().optional(),
  license: z.string().default("MIT"),
  tokens: RegistryTokenRefSchema.optional(),
  components: z.array(RegistryComponentRefSchema).default([]),
  meta: RegistryMetaSchema,
});

export type Registry = z.infer<typeof RegistrySchema>;
export type RegistryTokenRef = z.infer<typeof RegistryTokenRefSchema>;
export type RegistryComponentRef = z.infer<typeof RegistryComponentRefSchema>;
export type RegistryMeta = z.infer<typeof RegistryMetaSchema>;

// ── Helpers ────────────────────────────────────────────────────

/** Parse and validate a registry.json. Returns typed Registry or throws. */
export function parseRegistry(raw: unknown): Registry {
  return RegistrySchema.parse(raw);
}

/** Safe-parse version that returns errors instead of throwing. */
export function safeParseRegistry(raw: unknown): { success: true; data: Registry } | { success: false; error: string } {
  const result = RegistrySchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  const msg = result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ");
  return { success: false, error: msg };
}

/** Find a component ref by name in a registry. */
export function findComponent(registry: Registry, name: string): RegistryComponentRef | undefined {
  return registry.components.find(c => c.name === name);
}
