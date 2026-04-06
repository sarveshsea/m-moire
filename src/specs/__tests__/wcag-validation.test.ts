/**
 * WA-205 — WCAG Zod Validation Tests
 *
 * Covers WA-201 (touchTarget), WA-202 (focusWidth, focusContrastRatio),
 * WA-203 (colorContrast), and full ComponentSpec parse round-trips.
 */

import { describe, it, expect } from "vitest";
import { ComponentSpecSchema, parseTouchTarget } from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────

/** Minimal valid ComponentSpec input */
const minimalSpec = {
  name: "TestButton",
  type: "component" as const,
  purpose: "A button component for testing WCAG validators",
};

/** Build a spec with a custom accessibility block */
function withA11y(a11y: Record<string, unknown>) {
  return { ...minimalSpec, accessibility: a11y };
}

// ── WA-201: touchTarget ───────────────────────────────────────────

describe("WA-201 touchTarget schema", () => {
  it('accepts named alias "default"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ touchTarget: "default" }));
    expect(result.accessibility.touchTarget).toBe("default");
  });

  it('accepts named alias "min-24"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ touchTarget: "min-24" }));
    expect(result.accessibility.touchTarget).toBe("min-24");
  });

  it('accepts named alias "min-44"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ touchTarget: "min-44" }));
    expect(result.accessibility.touchTarget).toBe("min-44");
  });

  it('accepts pixel string "24x24"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ touchTarget: "24x24" }));
    expect(result.accessibility.touchTarget).toBe("24x24");
  });

  it('accepts pixel string "44x44"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ touchTarget: "44x44" }));
    expect(result.accessibility.touchTarget).toBe("44x44");
  });

  it('accepts pixel string "32x32"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ touchTarget: "32x32" }));
    expect(result.accessibility.touchTarget).toBe("32x32");
  });

  it('rejects "12x12" with WCAG 2.5.8 error message', () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ touchTarget: "12x12" }))
    ).toThrowError(/WCAG 2\.5\.8 AA/);
  });

  it('rejects "20x30" — width below 24px minimum', () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ touchTarget: "20x30" }))
    ).toThrowError(/WCAG 2\.5\.8 AA/);
  });

  it('rejects "30x20" — height below 24px minimum', () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ touchTarget: "30x20" }))
    ).toThrowError(/WCAG 2\.5\.8 AA/);
  });

  it('rejects arbitrary string "small" that does not match any valid form', () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ touchTarget: "small" }))
    ).toThrow();
  });

  it('defaults touchTarget to "default" when accessibility block is omitted', () => {
    const result = ComponentSpecSchema.parse(minimalSpec);
    expect(result.accessibility.touchTarget).toBe("default");
  });
});

// ── WA-201: parseTouchTarget helper ──────────────────────────────

describe("WA-201 parseTouchTarget helper", () => {
  it('"default" → meetsAA:true, meetsAAA:false, 24x24', () => {
    const r = parseTouchTarget("default");
    expect(r).toEqual({ w: 24, h: 24, meetsAA: true, meetsAAA: false });
  });

  it('"min-24" → meetsAA:true, meetsAAA:false', () => {
    const r = parseTouchTarget("min-24");
    expect(r.meetsAA).toBe(true);
    expect(r.meetsAAA).toBe(false);
  });

  it('"min-44" → meetsAA:true, meetsAAA:true', () => {
    const r = parseTouchTarget("min-44");
    expect(r.meetsAA).toBe(true);
    expect(r.meetsAAA).toBe(true);
  });

  it('"44x44" → meetsAA:true, meetsAAA:true', () => {
    const r = parseTouchTarget("44x44");
    expect(r).toEqual({ w: 44, h: 44, meetsAA: true, meetsAAA: true });
  });

  it('"32x32" → meetsAA:true, meetsAAA:false', () => {
    const r = parseTouchTarget("32x32");
    expect(r).toEqual({ w: 32, h: 32, meetsAA: true, meetsAAA: false });
  });

  it('"12x12" → meetsAA:false, meetsAAA:false', () => {
    const r = parseTouchTarget("12x12");
    expect(r.meetsAA).toBe(false);
    expect(r.meetsAAA).toBe(false);
  });

  it("unknown string → meetsAA:false, meetsAAA:false", () => {
    const r = parseTouchTarget("huge");
    expect(r.meetsAA).toBe(false);
    expect(r.meetsAAA).toBe(false);
  });
});

// ── WA-202: focusWidth ────────────────────────────────────────────

describe("WA-202 focusWidth", () => {
  it('accepts "2px"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ focusWidth: "2px" }));
    expect(result.accessibility.focusWidth).toBe("2px");
  });

  it('accepts "3px"', () => {
    const result = ComponentSpecSchema.parse(withA11y({ focusWidth: "3px" }));
    expect(result.accessibility.focusWidth).toBe("3px");
  });

  it('accepts "0.125rem" (= 2px)', () => {
    const result = ComponentSpecSchema.parse(withA11y({ focusWidth: "0.125rem" }));
    expect(result.accessibility.focusWidth).toBe("0.125rem");
  });

  it('rejects "1px" — below 2px minimum', () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ focusWidth: "1px" }))
    ).toThrowError(/2px/);
  });

  it('rejects "0px"', () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ focusWidth: "0px" }))
    ).toThrowError(/2px/);
  });

  it('defaults focusWidth to "2px" when not provided', () => {
    const result = ComponentSpecSchema.parse(minimalSpec);
    expect(result.accessibility.focusWidth).toBe("2px");
  });
});

// ── WA-202: focusContrastRatio ────────────────────────────────────

describe("WA-202 focusContrastRatio", () => {
  it("accepts 3.0 (minimum compliant)", () => {
    const result = ComponentSpecSchema.parse(withA11y({ focusContrastRatio: 3.0 }));
    expect(result.accessibility.focusContrastRatio).toBe(3.0);
  });

  it("accepts 4.5 (AA text contrast level)", () => {
    const result = ComponentSpecSchema.parse(withA11y({ focusContrastRatio: 4.5 }));
    expect(result.accessibility.focusContrastRatio).toBe(4.5);
  });

  it("accepts 7.0 (AAA text contrast level)", () => {
    const result = ComponentSpecSchema.parse(withA11y({ focusContrastRatio: 7.0 }));
    expect(result.accessibility.focusContrastRatio).toBe(7.0);
  });

  it("rejects 2.9 — below 3:1 minimum", () => {
    expect(() =>
      ComponentSpecSchema.parse(withA11y({ focusContrastRatio: 2.9 }))
    ).toThrowError(/3/);
  });

  it("is optional — omitting it parses successfully", () => {
    const result = ComponentSpecSchema.parse(minimalSpec);
    expect(result.accessibility.focusContrastRatio).toBeUndefined();
  });
});

// ── WA-203: colorContrast ─────────────────────────────────────────

describe("WA-203 colorContrast", () => {
  it("colorContrast block is optional — spec validates without it", () => {
    const result = ComponentSpecSchema.parse(minimalSpec);
    expect(result.accessibility.colorContrast).toBeUndefined();
  });

  it("accepts a full colorContrast block", () => {
    const result = ComponentSpecSchema.parse(
      withA11y({
        colorContrast: {
          foreground: "#1a1a1a",
          background: "#ffffff",
          minimumLevel: "AA",
          assertedRatio: 15.3,
        },
      })
    );
    expect(result.accessibility.colorContrast?.foreground).toBe("#1a1a1a");
    expect(result.accessibility.colorContrast?.assertedRatio).toBe(15.3);
  });

  it('defaults minimumLevel to "AA"', () => {
    const result = ComponentSpecSchema.parse(
      withA11y({
        colorContrast: { foreground: "#000", background: "#fff" },
      })
    );
    expect(result.accessibility.colorContrast?.minimumLevel).toBe("AA");
  });

  it('accepts minimumLevel "AAA"', () => {
    const result = ComponentSpecSchema.parse(
      withA11y({ colorContrast: { minimumLevel: "AAA" } })
    );
    expect(result.accessibility.colorContrast?.minimumLevel).toBe("AAA");
  });

  it('rejects invalid minimumLevel like "A"', () => {
    expect(() =>
      ComponentSpecSchema.parse(
        withA11y({ colorContrast: { minimumLevel: "A" } })
      )
    ).toThrow();
  });
});

// ── Full ComponentSpec round-trips ────────────────────────────────

describe("ComponentSpec full round-trips", () => {
  it("parses a ComponentSpec with all new WCAG fields populated", () => {
    const input = {
      ...minimalSpec,
      level: "molecule" as const,
      shadcnBase: ["Button", "Badge"],
      composesSpecs: ["Icon", "Label"],
      accessibility: {
        role: "button",
        ariaLabel: "required" as const,
        keyboardNav: true,
        focusStyle: "ring" as const,
        focusWidth: "3px",
        focusContrastRatio: 4.5,
        touchTarget: "min-44",
        reducedMotion: true,
        liveRegion: "off" as const,
        colorIndependent: true,
        colorContrast: {
          foreground: "#1a1a1a",
          background: "#f5f5f5",
          minimumLevel: "AA" as const,
          assertedRatio: 12.1,
        },
      },
    };
    const result = ComponentSpecSchema.parse(input);
    expect(result.accessibility.focusWidth).toBe("3px");
    expect(result.accessibility.focusContrastRatio).toBe(4.5);
    expect(result.accessibility.touchTarget).toBe("min-44");
    expect(result.accessibility.colorContrast?.assertedRatio).toBe(12.1);
  });

  it("parses a minimal ComponentSpec without any new optional fields", () => {
    // Only the three required top-level fields — all new WCAG fields are optional/defaulted
    const result = ComponentSpecSchema.parse(minimalSpec);
    expect(result.name).toBe("TestButton");
    expect(result.type).toBe("component");
    // Defaults are applied
    expect(result.accessibility.touchTarget).toBe("default");
    expect(result.accessibility.focusWidth).toBe("2px");
    expect(result.accessibility.focusContrastRatio).toBeUndefined();
    expect(result.accessibility.colorContrast).toBeUndefined();
  });
});
