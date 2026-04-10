/**
 * Penpot REST Client — bridges Penpot design files into the Memoire
 * design system registry, same output shape as the Figma REST client.
 *
 * Penpot uses an RPC-style API (not REST), authenticated via personal
 * access tokens. Supports both Penpot Cloud and self-hosted instances.
 *
 * Usage:
 *   memi connect --penpot https://design.penpot.app
 *   memi pull --penpot <file-id>
 */

import { createLogger } from "../engine/logger.js";
import type { DesignToken, DesignComponent, DesignStyle } from "../engine/registry.js";

const log = createLogger("penpot-rest");

export interface PenpotConfig {
  baseUrl: string;       // e.g. "https://design.penpot.app"
  token: string;         // Personal access token from Penpot Settings
  fileId?: string;       // Penpot file UUID
}

export interface PenpotPullResult {
  tokens: DesignToken[];
  components: DesignComponent[];
  styles: DesignStyle[];
  source: "penpot";
  fileId: string;
  fileName: string;
}

// ── API client ────────────────────────────────────────────────

async function rpc<T>(
  config: PenpotConfig,
  command: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${config.baseUrl}/api/rpc/command/${command}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  // Fix #4 (HIGH): disable redirect following to prevent auth token leakage
  // if a compromised/malicious Penpot server issues a 301 to an internal URL.
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Token ${config.token}`,
      Accept: "application/json",
    },
    redirect: "error",
  });

  if (!res.ok) {
    throw new Error(`Penpot API error ${res.status}: ${await res.text()}`);
  }

  return res.json() as Promise<T>;
}

// ── Profile check ─────────────────────────────────────────────

export async function getPenpotProfile(config: PenpotConfig): Promise<{ email: string; fullname: string }> {
  return rpc(config, "get-profile");
}

// ── File data ─────────────────────────────────────────────────

interface PenpotFile {
  id: string;
  name: string;
  data: {
    colors?: Record<string, { name: string; color: string; opacity?: number }>;
    typographies?: Record<string, {
      name: string;
      fonts: Array<{ fontFamily: string; fontSize: string; fontWeight: string; lineHeight?: string }>;
    }>;
    components?: Record<string, { name: string; path?: string; annotations?: string }>;
  };
  tokensLib?: {
    sets?: Record<string, {
      tokens?: Record<string, { value: unknown; type?: string; description?: string }>;
    }>;
  };
}

export async function getPenpotFile(config: PenpotConfig, fileId: string): Promise<PenpotFile> {
  return rpc(config, "get-file", { id: fileId });
}

// ── Pull design system ────────────────────────────────────────

export async function pullFromPenpot(config: PenpotConfig): Promise<PenpotPullResult> {
  if (!config.fileId) throw new Error("PENPOT_FILE_ID is required for pull");

  log.info({ fileId: config.fileId }, "Pulling from Penpot");

  let file: PenpotFile;
  try {
    file = await getPenpotFile(config, config.fileId);
  } catch (err) {
    throw new Error(`Failed to fetch Penpot file: ${err instanceof Error ? err.message : String(err)}`);
  }

  const tokens: DesignToken[] = [];
  const components: DesignComponent[] = [];
  const styles: DesignStyle[] = [];

  // ── Colors → color tokens ─────────────────────────────────
  const colors = file.data?.colors ?? {};
  for (const [id, color] of Object.entries(colors)) {
    const name = color.name ?? id;
    const cssVar = `--color-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    tokens.push({
      name,
      collection: "colors",
      type: "color",
      values: { default: color.color },
      cssVariable: cssVar,
    });
  }

  // ── Typographies → typography tokens ─────────────────────
  const typographies = file.data?.typographies ?? {};
  for (const [id, typo] of Object.entries(typographies)) {
    const name = typo.name ?? id;
    const firstFont = typo.fonts?.[0];
    if (!firstFont) continue;

    const cssVar = `--font-${name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
    tokens.push({
      name,
      collection: "typography",
      type: "typography",
      values: {
        fontFamily: firstFont.fontFamily,
        fontSize: firstFont.fontSize ?? "16px",
        fontWeight: firstFont.fontWeight ?? "400",
        lineHeight: firstFont.lineHeight ?? "1.5",
      },
      cssVariable: cssVar,
    });
  }

  // ── tokensLib (Tokens Studio-style token sets) ────────────
  const tokenSets = file.tokensLib?.sets ?? {};
  for (const [setName, set] of Object.entries(tokenSets)) {
    const tokenEntries = set.tokens ?? {};
    for (const [tokenName, token] of Object.entries(tokenEntries)) {
      const val = String(token.value ?? "");
      const rawType = (token.type ?? "").toLowerCase();
      const type: DesignToken["type"] =
        rawType === "color" ? "color" :
        rawType === "spacing" || rawType === "dimension" ? "spacing" :
        rawType === "border-radius" ? "radius" :
        rawType === "box-shadow" || rawType === "shadow" ? "shadow" :
        "other";

      const cssVar = `--${setName.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${tokenName.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;
      tokens.push({
        name: `${setName}/${tokenName}`,
        collection: setName,
        type,
        values: { default: val },
        cssVariable: cssVar,
      });
    }
  }

  // ── Components ────────────────────────────────────────────
  const fileComponents = file.data?.components ?? {};
  for (const [id, comp] of Object.entries(fileComponents)) {
    components.push({
      name: comp.name ?? id,
      key: id,
      description: comp.annotations ?? comp.path ?? "",
      variants: [],
      properties: {},
      figmaNodeId: id, // reuse field for Penpot node id
    });
  }

  log.info({
    tokens: tokens.length,
    components: components.length,
    source: "penpot",
  }, "Penpot pull complete");

  return {
    tokens,
    components,
    styles,
    source: "penpot",
    fileId: config.fileId,
    fileName: file.name,
  };
}
