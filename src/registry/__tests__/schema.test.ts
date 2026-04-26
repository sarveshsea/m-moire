/**
 * Registry schema validation tests — v0.11.0 protocol.
 */

import { describe, expect, it } from "vitest";
import { parseRegistry, safeParseRegistry, findComponent, RegistrySchema } from "../legacy.js";

const validRegistry = {
  name: "@acme/design-system",
  version: "1.0.0",
  description: "Acme design system",
  tokens: { href: "./tokens/tokens.json", format: "w3c-dtcg" as const },
  components: [
    { name: "Button", href: "./components/Button.json", level: "atom" as const, framework: "agnostic" as const },
    { name: "Card", href: "./components/Card.json", level: "molecule" as const, framework: "agnostic" as const },
  ],
  meta: {
    extractedAt: "2026-04-13T00:00:00.000Z",
    memoireVersion: "0.11.0",
  },
};

describe("Registry schema", () => {
  it("accepts a valid scoped package name", () => {
    const parsed = parseRegistry(validRegistry);
    expect(parsed.name).toBe("@acme/design-system");
    expect(parsed.components).toHaveLength(2);
  });

  it("accepts an unscoped package name", () => {
    const parsed = parseRegistry({ ...validRegistry, name: "design-system" });
    expect(parsed.name).toBe("design-system");
  });

  it("rejects an invalid npm package name", () => {
    const bad = { ...validRegistry, name: "Invalid Name With Spaces" };
    const result = safeParseRegistry(bad);
    expect(result.success).toBe(false);
  });

  it("rejects a non-semver version", () => {
    const bad = { ...validRegistry, version: "not-semver" };
    const result = safeParseRegistry(bad);
    expect(result.success).toBe(false);
  });

  it("accepts a prerelease semver", () => {
    const parsed = parseRegistry({ ...validRegistry, version: "1.0.0-beta.1" });
    expect(parsed.version).toBe("1.0.0-beta.1");
  });

  it("defaults license to MIT", () => {
    const parsed = parseRegistry(validRegistry);
    expect(parsed.license).toBe("MIT");
  });

  it("defaults component framework to agnostic", () => {
    const raw = {
      ...validRegistry,
      components: [{ name: "Button", href: "./Button.json" }],
    };
    const parsed = parseRegistry(raw);
    expect(parsed.components[0].framework).toBe("agnostic");
  });

  it("finds a component by name", () => {
    const parsed = parseRegistry(validRegistry);
    const btn = findComponent(parsed, "Button");
    expect(btn?.level).toBe("atom");
  });

  it("returns undefined for missing component", () => {
    const parsed = parseRegistry(validRegistry);
    expect(findComponent(parsed, "Missing")).toBeUndefined();
  });

  it("allows a registry with no components", () => {
    const parsed = parseRegistry({ ...validRegistry, components: [] });
    expect(parsed.components).toHaveLength(0);
  });

  it("allows a registry with no tokens", () => {
    const raw = { ...validRegistry };
    delete (raw as Record<string, unknown>).tokens;
    const parsed = parseRegistry(raw);
    expect(parsed.tokens).toBeUndefined();
  });

  it("returns structured errors on safe-parse failure", () => {
    const result = safeParseRegistry({ name: "bad name", version: "1.0.0", meta: { extractedAt: "", memoireVersion: "" } });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/name/);
    }
  });
});
