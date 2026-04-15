/**
 * tweakcn integration tests — verify parser handles both v3 and v4 CSS
 * shapes, shadcn shorthand colors, and multi-mode (:root + .dark) themes.
 */

import { describe, expect, it } from "vitest";
import { parseTweakcnCss, inferTokenType, fetchTweakcnTheme } from "../tweakcn.js";

// ── Realistic v3 export (shadcn shorthand HSL) ──────────────

const V3_EXPORT = `
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 221.2 83.2% 53.3%;
  --primary-foreground: 210 40% 98%;
  --radius: 0.5rem;
  --card: 0 0% 100%;
  --border: 214.3 31.8% 91.4%;
}

.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 217.2 91.2% 59.8%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --card: 222.2 84% 4.9%;
  --border: 217.2 32.6% 17.5%;
}
`;

// ── Realistic v4 @theme export (oklch + real units) ─────────

const V4_EXPORT = `
@theme {
  --color-background: oklch(100% 0 0);
  --color-foreground: oklch(15% 0.01 250);
  --color-primary: oklch(60% 0.18 250);
  --color-primary-foreground: oklch(98% 0.005 250);
  --radius-sm: 6px;
  --radius-md: 8px;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --spacing-md: 16px;
}
`;

describe("parseTweakcnCss (v3)", () => {
  it("parses :root variables", () => {
    const { tokens } = parseTweakcnCss(V3_EXPORT);
    const primary = tokens.find(t => t.cssVariable === "--primary");
    expect(primary).toBeDefined();
    expect(primary!.type).toBe("color");
  });

  it("normalizes shadcn shorthand to hsl()", () => {
    const { tokens } = parseTweakcnCss(V3_EXPORT);
    const bg = tokens.find(t => t.cssVariable === "--background");
    expect(bg!.values.default).toBe("hsl(0 0% 100%)");
  });

  it("detects dark mode and merges into a single token", () => {
    const { tokens, hasDarkMode } = parseTweakcnCss(V3_EXPORT);
    expect(hasDarkMode).toBe(true);
    const primary = tokens.find(t => t.cssVariable === "--primary");
    expect(primary!.values.default).toBe("hsl(221.2 83.2% 53.3%)");
    expect(primary!.values.dark).toBe("hsl(217.2 91.2% 59.8%)");
  });

  it("classifies --radius as radius type", () => {
    const { tokens } = parseTweakcnCss(V3_EXPORT);
    const radius = tokens.find(t => t.cssVariable === "--radius");
    expect(radius!.type).toBe("radius");
    expect(radius!.values.default).toBe("0.5rem");
  });

  it("strips leading -- when producing token name", () => {
    const { tokens } = parseTweakcnCss(V3_EXPORT);
    const card = tokens.find(t => t.cssVariable === "--card");
    expect(card!.name).toBe("card");
  });
});

describe("parseTweakcnCss (v4 @theme)", () => {
  it("parses @theme block variables", () => {
    const { tokens } = parseTweakcnCss(V4_EXPORT);
    expect(tokens.length).toBeGreaterThanOrEqual(7);
  });

  it("preserves oklch() color values verbatim", () => {
    const { tokens } = parseTweakcnCss(V4_EXPORT);
    const bg = tokens.find(t => t.cssVariable === "--color-background");
    expect(bg!.values.default).toBe("oklch(100% 0 0)");
  });

  it("classifies --shadow-* as shadow", () => {
    const { tokens } = parseTweakcnCss(V4_EXPORT);
    const shadow = tokens.find(t => t.cssVariable === "--shadow-sm");
    expect(shadow!.type).toBe("shadow");
  });

  it("classifies --spacing-* as spacing", () => {
    const { tokens } = parseTweakcnCss(V4_EXPORT);
    const sp = tokens.find(t => t.cssVariable === "--spacing-md");
    expect(sp!.type).toBe("spacing");
  });

  it("has no dark mode by default for @theme", () => {
    const { hasDarkMode } = parseTweakcnCss(V4_EXPORT);
    expect(hasDarkMode).toBe(false);
  });
});

describe("inferTokenType", () => {
  it("recognizes shadcn semantic color names", () => {
    expect(inferTokenType("--primary")).toBe("color");
    expect(inferTokenType("--background")).toBe("color");
    expect(inferTokenType("--destructive")).toBe("color");
    expect(inferTokenType("--border")).toBe("color");
  });

  it("recognizes tailwind v4 --color-* prefix", () => {
    expect(inferTokenType("--color-primary")).toBe("color");
  });

  it("recognizes radii, shadows, spacing, typography", () => {
    expect(inferTokenType("--radius")).toBe("radius");
    expect(inferTokenType("--radius-md")).toBe("radius");
    expect(inferTokenType("--shadow-sm")).toBe("shadow");
    expect(inferTokenType("--spacing-md")).toBe("spacing");
    expect(inferTokenType("--font-sans")).toBe("typography");
    expect(inferTokenType("--text-lg")).toBe("typography");
    expect(inferTokenType("--leading-tight")).toBe("typography");
  });

  it("falls back to 'other' for unknown variables", () => {
    expect(inferTokenType("--something-weird")).toBe("other");
  });
});

describe("fetchTweakcnTheme SSRF guard", () => {
  it("rejects localhost", async () => {
    await expect(fetchTweakcnTheme("http://localhost/theme.css")).rejects.toThrow(/private\/loopback/);
  });

  it("rejects 127.0.0.1", async () => {
    await expect(fetchTweakcnTheme("http://127.0.0.1/theme.css")).rejects.toThrow(/private\/loopback/);
  });

  it("rejects private IPv4", async () => {
    await expect(fetchTweakcnTheme("http://192.168.0.1/theme.css")).rejects.toThrow(/private\/loopback/);
    await expect(fetchTweakcnTheme("http://10.0.0.1/theme.css")).rejects.toThrow(/private\/loopback/);
    await expect(fetchTweakcnTheme("http://172.16.5.5/theme.css")).rejects.toThrow(/private\/loopback/);
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(fetchTweakcnTheme("ftp://example.com/theme.css")).rejects.toThrow(/http/);
  });
});
