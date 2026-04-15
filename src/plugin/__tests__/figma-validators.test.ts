import { describe, expect, it } from "vitest";
import {
  FIGMA_EXPORT_FORMATS,
  finiteNumber,
  isConcreteFontName,
  nodeFingerprint,
  optionalFiniteNumber,
  parseColorValue,
  validateScreenshotParams,
} from "../main/exec/figma-validators.js";

describe("validateScreenshotParams", () => {
  it("accepts all allowed formats (case-insensitive, jpeg→jpg)", () => {
    for (const fmt of FIGMA_EXPORT_FORMATS) {
      const ok = validateScreenshotParams({ format: fmt.toLowerCase(), scale: 1 });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.value.format).toBe(fmt);
    }
    const jpeg = validateScreenshotParams({ format: "jpeg", scale: 1 });
    expect(jpeg.ok).toBe(true);
    if (jpeg.ok) expect(jpeg.value.format).toBe("JPG");
  });

  it("rejects unknown formats with E_FIGMA_FORMAT_UNSUPPORTED", () => {
    const r = validateScreenshotParams({ format: "webp", scale: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("E_FIGMA_FORMAT_UNSUPPORTED");
      expect(r.error.detail?.allowed).toBeDefined();
    }
  });

  it("defaults scale to 2 when omitted", () => {
    const r = validateScreenshotParams({ format: "PNG" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.scale).toBe(2);
  });

  it("rejects NaN scale with E_PARAM_INVALID", () => {
    const r = validateScreenshotParams({ format: "PNG", scale: "abc" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("E_PARAM_INVALID");
  });

  it("rejects out-of-range scale with E_FIGMA_SCALE_OUT_OF_RANGE", () => {
    const small = validateScreenshotParams({ format: "PNG", scale: 0.01 });
    const huge = validateScreenshotParams({ format: "PNG", scale: 1000 });
    expect(small.ok).toBe(false);
    expect(huge.ok).toBe(false);
    if (!small.ok) expect(small.error.code).toBe("E_FIGMA_SCALE_OUT_OF_RANGE");
    if (!huge.ok) expect(huge.error.code).toBe("E_FIGMA_SCALE_OUT_OF_RANGE");
  });
});

describe("parseColorValue", () => {
  it("parses #RRGGBB", () => {
    expect(parseColorValue("#FF8800")).toEqual({
      r: 255 / 255,
      g: 136 / 255,
      b: 0,
      a: 1,
    });
  });

  it("parses #RGB as doubled nibbles", () => {
    const c = parseColorValue("#F80");
    expect(c).not.toBeNull();
    if (c) {
      expect(c.r).toBeCloseTo(1, 3);
      expect(c.g).toBeCloseTo(136 / 255, 3);
      expect(c.b).toBe(0);
    }
  });

  it("parses #RRGGBBAA with alpha", () => {
    const c = parseColorValue("#00000080");
    expect(c?.a).toBeCloseTo(128 / 255, 3);
  });

  it("parses #RGBA", () => {
    const c = parseColorValue("#0008");
    expect(c?.r).toBe(0);
    expect(c?.a).toBeCloseTo(136 / 255, 3);
  });

  it("parses rgb()/rgba() clamping alpha 0-1", () => {
    expect(parseColorValue("rgb(255, 0, 0)")).toEqual({ r: 1, g: 0, b: 0, a: 1 });
    const a = parseColorValue("rgba(128, 64, 32, 0.5)");
    expect(a?.a).toBe(0.5);
  });

  it("returns null for non-color strings", () => {
    expect(parseColorValue("10px")).toBeNull();
    expect(parseColorValue("#zzz")).toBeNull();
    expect(parseColorValue("#12")).toBeNull();
    expect(parseColorValue("")).toBeNull();
    expect(parseColorValue(42)).toBeNull();
    expect(parseColorValue(null)).toBeNull();
  });
});

describe("finiteNumber / optionalFiniteNumber", () => {
  it("falls back on NaN or Infinity", () => {
    expect(finiteNumber("abc", 7)).toBe(7);
    expect(finiteNumber(Infinity, 0)).toBe(0);
    expect(finiteNumber("12.5", 0)).toBe(12.5);
  });

  it("optional returns null for missing/bad", () => {
    expect(optionalFiniteNumber(undefined)).toBeNull();
    expect(optionalFiniteNumber("")).toBeNull();
    expect(optionalFiniteNumber("NaN")).toBeNull();
    expect(optionalFiniteNumber(3)).toBe(3);
  });
});

describe("nodeFingerprint", () => {
  it("is stable for identical nodes", () => {
    const a = { type: "FRAME", name: "Hero", x: 10, y: 20, width: 300, height: 200, visible: true };
    const b = { ...a };
    expect(nodeFingerprint(a)).toBe(nodeFingerprint(b));
  });

  it("changes when any tracked field changes", () => {
    const base = { type: "FRAME", name: "Hero", x: 10, y: 20, width: 300, height: 200 };
    const f0 = nodeFingerprint(base);
    expect(nodeFingerprint({ ...base, name: "Hero2" })).not.toBe(f0);
    expect(nodeFingerprint({ ...base, x: 11 })).not.toBe(f0);
    expect(nodeFingerprint({ ...base, width: 301 })).not.toBe(f0);
    expect(nodeFingerprint({ ...base, visible: false })).not.toBe(f0);
  });

  it("folds fills array length, not content", () => {
    const base = { type: "FRAME", name: "A", fills: [{ type: "SOLID" }] };
    const same = { type: "FRAME", name: "A", fills: [{ type: "GRADIENT" }] };
    const different = { type: "FRAME", name: "A", fills: [{ type: "SOLID" }, { type: "SOLID" }] };
    expect(nodeFingerprint(base)).toBe(nodeFingerprint(same));
    expect(nodeFingerprint(base)).not.toBe(nodeFingerprint(different));
  });

  it("starts with v1- prefix so future schema changes can migrate", () => {
    expect(nodeFingerprint({ type: "FRAME", name: "x" }).startsWith("v1-")).toBe(true);
  });

  it("returns 'none' for non-object inputs", () => {
    expect(nodeFingerprint(null)).toBe("none");
    expect(nodeFingerprint(undefined)).toBe("none");
    expect(nodeFingerprint(42)).toBe("none");
  });
});

describe("isConcreteFontName", () => {
  const mixed = Symbol("mixed");
  it("accepts {family, style} shape", () => {
    expect(isConcreteFontName({ family: "Inter", style: "Regular" }, mixed)).toBe(true);
  });
  it("rejects mixed sentinel", () => {
    expect(isConcreteFontName(mixed, mixed)).toBe(false);
  });
  it("rejects malformed shapes", () => {
    expect(isConcreteFontName({ family: "Inter" }, mixed)).toBe(false);
    expect(isConcreteFontName({ family: 1, style: "x" }, mixed)).toBe(false);
    expect(isConcreteFontName(null, mixed)).toBe(false);
    expect(isConcreteFontName("Inter", mixed)).toBe(false);
  });
});
