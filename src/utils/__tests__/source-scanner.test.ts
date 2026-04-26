import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { scanSources } from "../source-scanner.js";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "memoire-source-scan-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("scanSources", () => {
  it("walks local files deterministically with ignore dirs and max budget", async () => {
    const root = await makeRoot();
    await mkdir(join(root, "src", "nested"), { recursive: true });
    await mkdir(join(root, "src", "node_modules"), { recursive: true });
    await writeFile(join(root, "src", "z.tsx"), "export const z = 1;");
    await writeFile(join(root, "src", "a.css"), ":root { --color: red; }");
    await writeFile(join(root, "src", "nested", "b.jsx"), "export const b = 1;");
    await writeFile(join(root, "src", "node_modules", "ignored.tsx"), "nope");

    const files = await scanSources({
      projectRoot: root,
      target: "src",
      extensions: [".tsx", ".jsx", ".css"],
      maxFiles: 2,
      concurrency: 2,
    });

    expect(files.map((file) => file.path)).toEqual(["a.css", "nested/b.jsx"]);
    expect(files.map((file) => file.projectPath)).toEqual(["src/a.css", "src/nested/b.jsx"]);
  });

  it("fetches url html and inline styles with a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => "<html><style>:root { --radius: 8px; }</style></html>",
    })));

    const files = await scanSources({
      projectRoot: await makeRoot(),
      target: "https://example.com",
      extensions: [".html", ".css"],
      fetchTimeoutMs: 50,
    });

    expect(files.map((file) => file.id)).toEqual([
      "https://example.com",
      "https://example.com#inline-1",
    ]);
    expect(fetch).toHaveBeenCalledWith("https://example.com", expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });
});
