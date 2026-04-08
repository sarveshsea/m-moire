/**
 * MCP tools registration smoke test — verifies all expected tools are
 * registered and that design_doc is present in the tool list.
 */

import { describe, expect, it } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";

async function readToolsSrc(): Promise<string> {
  return readFile(join(process.cwd(), "src", "mcp", "tools.ts"), "utf-8");
}

describe("MCP tools registration", () => {
  it("includes design_doc tool", async () => {
    const src = await readToolsSrc();
    expect(src).toContain('"design_doc"');
  });

  it("registers at least 18 tools (v0.8.0 baseline)", async () => {
    const src = await readToolsSrc();
    const matches = src.match(/server\.tool\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(18);
  });

  it("design_doc tool accepts a url parameter", async () => {
    const src = await readToolsSrc();
    const designDocIdx = src.indexOf('"design_doc"');
    expect(designDocIdx).toBeGreaterThan(-1);
    // Within the next 2000 chars after the tool name we expect a url param
    const snippet = src.slice(designDocIdx, designDocIdx + 2000);
    expect(snippet).toContain("url");
  });

  it("design_doc tool accepts a raw boolean parameter", async () => {
    const src = await readToolsSrc();
    const designDocIdx = src.indexOf('"design_doc"');
    const snippet = src.slice(designDocIdx, designDocIdx + 2000);
    expect(snippet).toContain("raw");
  });

  it("pull_design_system tool is still registered", async () => {
    const src = await readToolsSrc();
    expect(src).toContain('"pull_design_system"');
  });

  it("get_specs tool is still registered", async () => {
    const src = await readToolsSrc();
    expect(src).toContain('"get_specs"');
  });

  it("check_bridge_health tool is still registered", async () => {
    const src = await readToolsSrc();
    expect(src).toContain('"check_bridge_health"');
  });
});
