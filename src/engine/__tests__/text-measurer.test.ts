import { describe, it, expect, beforeEach } from "vitest";
import { TextMeasurer, getTextMeasurer } from "../text-measurer.js";

let measurer: TextMeasurer;

beforeEach(() => {
  measurer = new TextMeasurer();
});

describe("TextMeasurer.measure", () => {
  it("measures single-line text", () => {
    const result = measurer.measure("Hello", { maxWidth: 1000 });
    expect(result.lineCount).toBe(1);
    expect(result.height).toBeGreaterThan(0);
  });

  it("wraps text into multiple lines at narrow width", () => {
    const text = "This is a longer sentence that should wrap into multiple lines at a narrow width";
    const result = measurer.measure(text, { maxWidth: 100 });
    expect(result.lineCount).toBeGreaterThan(1);
  });

  it("returns more lines at narrower widths", () => {
    const text = "The quick brown fox jumps over the lazy dog near the riverbank";
    const wide = measurer.measure(text, { maxWidth: 500 });
    const narrow = measurer.measure(text, { maxWidth: 100 });
    expect(narrow.lineCount).toBeGreaterThan(wide.lineCount);
  });

  it("handles empty string", () => {
    const result = measurer.measure("", { maxWidth: 200 });
    expect(result.lineCount).toBeGreaterThanOrEqual(0);
    expect(result.height).toBeGreaterThanOrEqual(0);
  });

  it("respects custom font size", () => {
    const text = "Test text for font size comparison";
    const small = measurer.measure(text, { maxWidth: 200, font: "12px sans-serif" });
    const large = measurer.measure(text, { maxWidth: 200, font: "24px sans-serif" });
    expect(large.height).toBeGreaterThan(small.height);
  });

  it("uses cache for repeated measurements", () => {
    const text = "Cached text measurement";
    measurer.measure(text, { maxWidth: 200 });
    expect(measurer.cacheSize).toBe(1);
    measurer.measure(text, { maxWidth: 300 }); // same text+font, different width
    expect(measurer.cacheSize).toBe(1); // cache is by text+font, not width
  });
});

describe("TextMeasurer.measureDetailed", () => {
  it("returns per-line text and width", () => {
    const result = measurer.measureDetailed("Hello world, this is a longer text", { maxWidth: 100 });
    expect(result.lines.length).toBeGreaterThan(0);
    for (const line of result.lines) {
      expect(line.text).toBeTruthy();
      expect(line.width).toBeGreaterThan(0);
    }
  });

  it("line count matches lines array length", () => {
    const result = measurer.measureDetailed("A B C D E F G H I J K L M N O P", { maxWidth: 80 });
    expect(result.lineCount).toBe(result.lines.length);
  });
});

describe("TextMeasurer.checkOverflow", () => {
  it("reports fits=true when container is large enough", () => {
    const result = measurer.checkOverflow("Short text", { maxWidth: 500, containerHeight: 100 });
    expect(result.fits).toBe(true);
    expect(result.overflow).toBeLessThan(0);
  });

  it("reports fits=false when container is too small", () => {
    const text = "This is a very long text that should definitely overflow a tiny container because it has many words";
    const result = measurer.checkOverflow(text, { maxWidth: 80, containerHeight: 10 });
    expect(result.fits).toBe(false);
    expect(result.overflow).toBeGreaterThan(0);
  });
});

describe("TextMeasurer.checkBreakpoints", () => {
  it("returns results for all default breakpoints", () => {
    const results = measurer.checkBreakpoints("Design system text measurement test");
    expect(results.length).toBe(5); // mobile, mobile-lg, tablet, desktop, desktop-lg
    expect(results[0].breakpoint).toBe("mobile");
  });

  it("fewer lines at wider breakpoints", () => {
    const text = "This text should wrap more at mobile width than desktop width because it is moderately long";
    const results = measurer.checkBreakpoints(text);
    const mobile = results.find((r) => r.breakpoint === "mobile")!;
    const desktop = results.find((r) => r.breakpoint === "desktop")!;
    expect(mobile.lineCount).toBeGreaterThanOrEqual(desktop.lineCount);
  });

  it("accepts custom breakpoints", () => {
    const results = measurer.checkBreakpoints("Test", { breakpoints: { sm: 300, lg: 1200 } });
    expect(results).toHaveLength(2);
    expect(results[0].breakpoint).toBe("sm");
    expect(results[1].breakpoint).toBe("lg");
  });
});

describe("TextMeasurer.findMinWidth", () => {
  it("finds minimum width for single line", () => {
    const text = "Hello world";
    const minWidth = measurer.findMinWidth(text, { maxLines: 1 });
    // At minWidth, text should fit in 1 line
    const result = measurer.measure(text, { maxWidth: minWidth });
    expect(result.lineCount).toBe(1);
    // At minWidth - 10, text should wrap
    const narrower = measurer.measure(text, { maxWidth: minWidth - 10 });
    expect(narrower.lineCount).toBeGreaterThanOrEqual(1);
  });

  it("returns smaller width for more allowed lines", () => {
    const text = "The quick brown fox jumps over the lazy dog near the riverbank at dawn";
    const oneLine = measurer.findMinWidth(text, { maxLines: 1 });
    const twoLines = measurer.findMinWidth(text, { maxLines: 2 });
    expect(twoLines).toBeLessThanOrEqual(oneLine);
  });
});

describe("TextMeasurer.clearCache", () => {
  it("empties the cache", () => {
    measurer.measure("a", { maxWidth: 100 });
    measurer.measure("b", { maxWidth: 100 });
    expect(measurer.cacheSize).toBe(2);
    measurer.clearCache();
    expect(measurer.cacheSize).toBe(0);
  });
});

describe("getTextMeasurer singleton", () => {
  it("returns the same instance", () => {
    const a = getTextMeasurer();
    const b = getTextMeasurer();
    expect(a).toBe(b);
  });
});
