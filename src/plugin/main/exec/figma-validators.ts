// Input validators for Figma-domain command params. Replaces ad-hoc
// String(...).toUpperCase() / Number(...) fallthrough in main/index.ts with
// explicit allowlists so Figma doesn't reject silently at the API boundary.

import { arrayIncludes } from "../../shared/compat.js";
import { makeError, type WidgetError } from "../../shared/errors.js";

export const FIGMA_EXPORT_FORMATS = ["PNG", "JPG", "SVG", "PDF"] as const;
export type FigmaExportFormat = (typeof FIGMA_EXPORT_FORMATS)[number];

export const SCREENSHOT_MIN_SCALE = 0.1;
export const SCREENSHOT_MAX_SCALE = 4;

export interface ValidatedScreenshotParams {
  format: FigmaExportFormat;
  scale: number;
}

export function validateScreenshotParams(
  raw: { format?: unknown; scale?: unknown },
): { ok: true; value: ValidatedScreenshotParams } | { ok: false; error: WidgetError } {
  const format = normalizeFormat(raw.format);
  if (!arrayIncludes(FIGMA_EXPORT_FORMATS, format)) {
    return {
      ok: false,
      error: makeError(
        "E_FIGMA_FORMAT_UNSUPPORTED",
        "Unsupported export format: " + String(raw.format),
        { detail: { allowed: FIGMA_EXPORT_FORMATS as unknown as string[] } },
      ),
    };
  }

  const scaleRaw = raw.scale === undefined || raw.scale === null ? 2 : Number(raw.scale);
  if (!Number.isFinite(scaleRaw)) {
    return {
      ok: false,
      error: makeError("E_PARAM_INVALID", "scale must be a finite number", {
        detail: { received: raw.scale },
      }),
    };
  }
  if (scaleRaw < SCREENSHOT_MIN_SCALE || scaleRaw > SCREENSHOT_MAX_SCALE) {
    return {
      ok: false,
      error: makeError(
        "E_FIGMA_SCALE_OUT_OF_RANGE",
        "scale out of range [" + SCREENSHOT_MIN_SCALE + ", " + SCREENSHOT_MAX_SCALE + "]",
        { detail: { received: scaleRaw } },
      ),
    };
  }

  return { ok: true, value: { format, scale: scaleRaw } };
}

function normalizeFormat(raw: unknown): FigmaExportFormat {
  if (raw === undefined || raw === null || raw === "") return "PNG";
  const text = String(raw).toUpperCase();
  // Normalize common aliases.
  if (text === "JPEG") return "JPG";
  return text as FigmaExportFormat;
}

// Parse a color token value into Figma's RGBA shape. Supports:
//   #RGB, #RGBA, #RRGGBB, #RRGGBBAA
//   rgb(r,g,b) / rgba(r,g,b,a)   — components 0-255, alpha 0-1
// Returns null for values that are not recognizable colors so callers can
// dispatch to the non-color token path (dimension, string, etc.).
export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColorValue(value: unknown): FigmaColor | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.charAt(0) === "#") return parseHexColor(trimmed);

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)$/i,
  );
  if (rgbMatch) {
    const r = clamp01(Number(rgbMatch[1]) / 255);
    const g = clamp01(Number(rgbMatch[2]) / 255);
    const b = clamp01(Number(rgbMatch[3]) / 255);
    const a = rgbMatch[4] === undefined ? 1 : clamp01(Number(rgbMatch[4]));
    return { r, g, b, a };
  }

  return null;
}

function parseHexColor(hex: string): FigmaColor | null {
  const body = hex.substring(1);
  if (!/^[0-9a-f]+$/i.test(body)) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (body.length === 3) {
    r = parseInt(body.charAt(0) + body.charAt(0), 16) / 255;
    g = parseInt(body.charAt(1) + body.charAt(1), 16) / 255;
    b = parseInt(body.charAt(2) + body.charAt(2), 16) / 255;
  } else if (body.length === 4) {
    r = parseInt(body.charAt(0) + body.charAt(0), 16) / 255;
    g = parseInt(body.charAt(1) + body.charAt(1), 16) / 255;
    b = parseInt(body.charAt(2) + body.charAt(2), 16) / 255;
    a = parseInt(body.charAt(3) + body.charAt(3), 16) / 255;
  } else if (body.length === 6) {
    r = parseInt(body.substring(0, 2), 16) / 255;
    g = parseInt(body.substring(2, 4), 16) / 255;
    b = parseInt(body.substring(4, 6), 16) / 255;
  } else if (body.length === 8) {
    r = parseInt(body.substring(0, 2), 16) / 255;
    g = parseInt(body.substring(2, 4), 16) / 255;
    b = parseInt(body.substring(4, 6), 16) / 255;
    a = parseInt(body.substring(6, 8), 16) / 255;
  } else {
    return null;
  }
  return { r, g, b, a };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

// Guard arbitrary numeric params from Figma commands against NaN/Infinity
// corruption so we never write bogus numbers to the Figma API (#41).
export function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function optionalFiniteNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Figma.mixed is a unique symbol sentinel. The original code used !== figma.mixed
// which works, but didn't assert shape on the alternate branch. This helper
// narrows to a concrete FontName-like object (#58).
export function isConcreteFontName(value: unknown, mixedSentinel: unknown): value is { family: string; style: string } {
  if (value === undefined || value === null) return false;
  if (value === mixedSentinel) return false;
  if (typeof value !== "object") return false;
  const fn = value as { family?: unknown; style?: unknown };
  return typeof fn.family === "string" && typeof fn.style === "string";
}

// Cheap, deterministic fingerprint over the mutable state of a scene node.
// Used for optimistic concurrency on updateNode (#29): the caller reads the
// node, receives this fingerprint, and must present it back on write so a
// stale client cannot overwrite a concurrent change without realising.
//
// We deliberately fold only the fields that serializeSelectionNode exposes;
// if the caller never saw a property, we don't care if it diverged.
export function nodeFingerprint(node: unknown): string {
  if (!node || typeof node !== "object") return "none";
  const n = node as Record<string, unknown>;
  const parts: string[] = [];
  parts.push("t=" + String(n.type ?? ""));
  parts.push("n=" + String(n.name ?? ""));
  if ("x" in n) parts.push("x=" + String(n.x));
  if ("y" in n) parts.push("y=" + String(n.y));
  if ("width" in n) parts.push("w=" + String(n.width));
  if ("height" in n) parts.push("h=" + String(n.height));
  if ("visible" in n) parts.push("v=" + String(n.visible));
  if ("opacity" in n) parts.push("o=" + String(n.opacity));
  if ("rotation" in n) parts.push("r=" + String(n.rotation));
  if ("characters" in n) parts.push("c=" + String((n.characters as string | undefined)?.length ?? 0));
  if ("fills" in n && Array.isArray((n as { fills?: unknown }).fills)) {
    parts.push("fl=" + String(((n as { fills: unknown[] }).fills).length));
  }
  // fnv-1a 32-bit — portable, allocation-light, no imports.
  const raw = parts.join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return "v1-" + hash.toString(16);
}
