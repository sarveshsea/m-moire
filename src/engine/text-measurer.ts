/**
 * TextMeasurer — Server-side text measurement powered by @chenglou/pretext.
 *
 * Provides accurate multiline text height prediction and line counting
 * without a browser DOM. Uses @napi-rs/canvas to provide the Canvas
 * context that Pretext's prepare() phase requires.
 *
 * Usage:
 *   const measurer = new TextMeasurer();
 *   const result = measurer.measure("Hello world", { maxWidth: 200 });
 *   // { height: 40, lineCount: 2 }
 */

import { createCanvas } from "@napi-rs/canvas";
import { prepare, layout, prepareWithSegments, layoutWithLines, clearCache } from "@chenglou/pretext";
import type { PreparedText } from "@chenglou/pretext";
import { createLogger } from "./logger.js";

const log = createLogger("text-measurer");

// ── OffscreenCanvas Polyfill ────────────────────────────

let polyfillInstalled = false;

function ensurePolyfill(): void {
  if (polyfillInstalled) return;
  if (typeof globalThis.OffscreenCanvas === "undefined") {
    // Pretext checks for globalThis.OffscreenCanvas to get a Canvas2D context.
    // @napi-rs/canvas provides server-side Canvas with measureText support.
    /* eslint-disable @typescript-eslint/no-explicit-any */
    (globalThis as any).OffscreenCanvas = class OffscreenCanvasPolyfill {
      width: number;
      height: number;
      private _canvas: any;
      constructor(w: number, h: number) {
        this.width = w;
        this.height = h;
        this._canvas = createCanvas(w, h);
      }
      getContext(type: string) {
        return this._canvas.getContext(type);
      }
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
    log.info("Installed OffscreenCanvas polyfill for server-side text measurement");
  }
  polyfillInstalled = true;
}

// ── Types ──────────────────────────────────────────────────

export interface MeasureOptions {
  /** Maximum width in pixels for line wrapping. */
  maxWidth: number;
  /** CSS font string (e.g., "16px Inter", "bold 14px sans-serif"). Default: "16px sans-serif". */
  font?: string;
  /** Line height in pixels. Default: font-size * 1.5. */
  lineHeight?: number;
}

export interface MeasureResult {
  /** Total height in pixels. */
  height: number;
  /** Number of wrapped lines. */
  lineCount: number;
}

export interface DetailedMeasureResult extends MeasureResult {
  /** Per-line text content and width. */
  lines: Array<{ text: string; width: number }>;
}

export interface OverflowCheck {
  /** Whether the text fits within the container. */
  fits: boolean;
  /** Actual height needed. */
  actualHeight: number;
  /** Container height. */
  containerHeight: number;
  /** Number of lines. */
  lineCount: number;
  /** How many pixels of overflow (negative = fits with room). */
  overflow: number;
}

export interface BreakpointResult {
  /** Breakpoint name (e.g., "mobile", "tablet", "desktop"). */
  breakpoint: string;
  /** Container width at this breakpoint. */
  width: number;
  /** Whether text fits at this width. */
  fits: boolean;
  /** Line count at this width. */
  lineCount: number;
  /** Height at this width. */
  height: number;
}

// ── Default Breakpoints ────────────────────────────────────

const DEFAULT_BREAKPOINTS: Record<string, number> = {
  mobile: 320,
  "mobile-lg": 375,
  tablet: 768,
  desktop: 1024,
  "desktop-lg": 1440,
};

// ── TextMeasurer ───────────────────────────────────────────

export class TextMeasurer {
  private cache = new Map<string, PreparedText>();
  private maxCacheSize: number;

  constructor(maxCacheSize = 500) {
    this.maxCacheSize = maxCacheSize;
    ensurePolyfill();
  }

  /** Measure text: returns height and line count. */
  measure(text: string, opts: MeasureOptions): MeasureResult {
    const font = opts.font ?? "16px sans-serif";
    const lineHeight = opts.lineHeight ?? parseFontSize(font) * 1.5;
    const prepared = this.getPrepared(text, font);
    return layout(prepared, opts.maxWidth, lineHeight);
  }

  /** Measure text with per-line detail. */
  measureDetailed(text: string, opts: MeasureOptions): DetailedMeasureResult {
    const font = opts.font ?? "16px sans-serif";
    const lineHeight = opts.lineHeight ?? parseFontSize(font) * 1.5;
    const prepared = prepareWithSegments(text, font);
    const result = layoutWithLines(prepared, opts.maxWidth, lineHeight);
    return {
      height: result.height,
      lineCount: result.lineCount,
      lines: result.lines.map((l) => ({ text: l.text, width: l.width })),
    };
  }

  /** Check if text fits within a container. */
  checkOverflow(text: string, opts: MeasureOptions & { containerHeight: number }): OverflowCheck {
    const result = this.measure(text, opts);
    return {
      fits: result.height <= opts.containerHeight,
      actualHeight: result.height,
      containerHeight: opts.containerHeight,
      lineCount: result.lineCount,
      overflow: result.height - opts.containerHeight,
    };
  }

  /** Test text at multiple breakpoints. */
  checkBreakpoints(
    text: string,
    opts: {
      font?: string;
      lineHeight?: number;
      containerHeight?: number;
      breakpoints?: Record<string, number>;
    } = {},
  ): BreakpointResult[] {
    const breakpoints = opts.breakpoints ?? DEFAULT_BREAKPOINTS;
    const containerHeight = opts.containerHeight ?? Infinity;

    return Object.entries(breakpoints).map(([name, width]) => {
      const result = this.measure(text, { maxWidth: width, font: opts.font, lineHeight: opts.lineHeight });
      return {
        breakpoint: name,
        width,
        fits: result.height <= containerHeight,
        lineCount: result.lineCount,
        height: result.height,
      };
    });
  }

  /** Find the minimum width where text fits in a given number of lines. */
  findMinWidth(text: string, opts: { maxLines: number; font?: string; lineHeight?: number; minWidth?: number; maxWidth?: number }): number {
    const font = opts.font ?? "16px sans-serif";
    const lineHeight = opts.lineHeight ?? parseFontSize(font) * 1.5;
    let lo = opts.minWidth ?? 50;
    let hi = opts.maxWidth ?? 2000;

    // Binary search for minimum width
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      const result = this.measure(text, { maxWidth: mid, font, lineHeight });
      if (result.lineCount <= opts.maxLines) {
        hi = mid;
      } else {
        lo = mid;
      }
    }

    return hi;
  }

  /** Clear the internal measurement cache and Pretext's global cache. */
  clearCache(): void {
    this.cache.clear();
    clearCache();
  }

  /** Get cache size for monitoring. */
  get cacheSize(): number {
    return this.cache.size;
  }

  // ── Internal ─────────────────────────────────────────

  private getPrepared(text: string, font: string): PreparedText {
    const key = `${font}\0${text}`;
    let prepared = this.cache.get(key);
    if (!prepared) {
      prepared = prepare(text, font);
      this.cache.set(key, prepared);
      // Evict oldest entries when cache is full
      if (this.cache.size > this.maxCacheSize) {
        const firstKey = this.cache.keys().next().value!;
        this.cache.delete(firstKey);
      }
    }
    return prepared;
  }
}

/** Parse font size from a CSS font string. */
function parseFontSize(font: string): number {
  const match = font.match(/(\d+(?:\.\d+)?)\s*px/);
  return match ? parseFloat(match[1]) : 16;
}

// ── Singleton ──────────────────────────────────────────────

let instance: TextMeasurer | null = null;

export function getTextMeasurer(): TextMeasurer {
  if (!instance) instance = new TextMeasurer();
  return instance;
}
