/**
 * Preview Server — Manages the Vite-based HTML preview environment
 * that renders all generated components, pages, and dataviz.
 */

import { spawn, type ChildProcess } from "child_process";
import { writeFile, mkdir, readdir } from "fs/promises";
import { join } from "path";
import { createLogger } from "../engine/logger.js";
import type { Registry } from "../engine/registry.js";

const log = createLogger("preview");

export class PreviewServer {
  private process: ChildProcess | null = null;
  private projectRoot: string;
  private port: number;

  constructor(projectRoot: string, port = 5173) {
    this.projectRoot = projectRoot;
    this.port = port;
  }

  /**
   * Generate the preview gallery index that auto-imports all generated components.
   */
  async buildGallery(registry: Registry): Promise<void> {
    const previewDir = join(this.projectRoot, "preview");
    const srcDir = join(previewDir, "src");
    await mkdir(srcDir, { recursive: true });

    const specs = await registry.getAllSpecs();
    const components = specs.filter((s) => s.type === "component");
    const pages = specs.filter((s) => s.type === "page");
    const dataviz = specs.filter((s) => s.type === "dataviz");

    // Build imports and gallery content
    const imports: string[] = [];
    const galleryItems: string[] = [];

    for (const spec of components) {
      const gen = registry.getGenerationState(spec.name);
      if (!gen) continue;
      imports.push(`import { ${spec.name} } from "../../generated/components/${spec.name}"`);
      galleryItems.push(`
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-mono text-muted-foreground mb-2">${spec.name}</h3>
          <${spec.name} />
        </div>`);
    }

    for (const spec of dataviz) {
      const gen = registry.getGenerationState(spec.name);
      if (!gen) continue;
      imports.push(`import { ${spec.name} } from "../../generated/dataviz/${spec.name}"`);
      galleryItems.push(`
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-mono text-muted-foreground mb-2">${spec.name}</h3>
          <${spec.name} />
        </div>`);
    }

    const appContent = `
import React from "react"
${imports.join("\n")}

export default function App() {
  return (
    <div className="min-h-screen bg-background p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Mémoire Preview Gallery</h1>
        <p className="text-muted-foreground mt-1">
          ${components.length} components · ${dataviz.length} dataviz · ${pages.length} pages
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        ${galleryItems.join("\n        ")}
      </div>

      {${galleryItems.length} === 0 && (
        <div className="text-center text-muted-foreground py-20">
          <p>No generated components yet.</p>
          <p className="text-sm mt-2">Run <code>memi spec component MyComponent</code> then <code>memi generate</code></p>
        </div>
      )}
    </div>
  )
}
`;

    await writeFile(join(srcDir, "App.tsx"), appContent);
    log.info({ count: galleryItems.length }, "Gallery rebuilt");
  }

  start(): void {
    const previewDir = join(this.projectRoot, "preview");

    this.process = spawn("npx", ["vite", "--port", String(this.port)], {
      cwd: previewDir,
      stdio: "pipe",
      shell: true,
    });

    this.process.stdout?.on("data", (data) => {
      const line = data.toString().trim();
      if (line) log.info(line);
    });

    this.process.stderr?.on("data", (data) => {
      const line = data.toString().trim();
      if (line) log.warn(line);
    });

    log.info(`Preview server starting on port ${this.port}`);
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      log.info("Preview server stopped");
    }
  }

  get url(): string {
    return `http://localhost:${this.port}`;
  }
}
