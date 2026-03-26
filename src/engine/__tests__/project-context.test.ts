import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { detectProject } from "../project-context.js";

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `memoire-ctx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function writePkg(deps: Record<string, string> = {}, devDeps: Record<string, string> = {}) {
  await writeFile(
    join(testDir, "package.json"),
    JSON.stringify({ dependencies: deps, devDependencies: devDeps }, null, 2)
  );
}

describe("detectProject — framework detection", () => {
  it("detects Vite project from dependencies", async () => {
    await writePkg({ vite: "^5.0.0", react: "^18.0.0" });
    const ctx = await detectProject(testDir);
    expect(ctx.framework).toBe("vite");
  });

  it("detects Vite project from vite.config.ts", async () => {
    await writePkg({ react: "^18.0.0" });
    await writeFile(join(testDir, "vite.config.ts"), "export default {}");
    const ctx = await detectProject(testDir);
    expect(ctx.framework).toBe("vite");
  });

  it("detects Next.js project", async () => {
    await writePkg({ next: "^14.0.0", react: "^18.0.0" });
    const ctx = await detectProject(testDir);
    expect(ctx.framework).toBe("nextjs");
  });

  it("falls back to unknown when no indicators", async () => {
    await writePkg({});
    const ctx = await detectProject(testDir);
    expect(ctx.framework).toBe("unknown");
  });

  it("falls back to unknown when no package.json", async () => {
    const ctx = await detectProject(testDir);
    expect(ctx.framework).toBe("unknown");
  });
});

describe("detectProject — language detection", () => {
  it("detects TypeScript from tsconfig.json", async () => {
    await writePkg({});
    await writeFile(join(testDir, "tsconfig.json"), JSON.stringify({ compilerOptions: {} }));
    const ctx = await detectProject(testDir);
    expect(ctx.language).toBe("typescript");
  });

  it("defaults to JavaScript when no tsconfig.json", async () => {
    await writePkg({});
    const ctx = await detectProject(testDir);
    expect(ctx.language).toBe("javascript");
  });
});

describe("detectProject — Tailwind detection", () => {
  it("detects Tailwind from deps", async () => {
    await writePkg({ tailwindcss: "^3.4.0" });
    const ctx = await detectProject(testDir);
    expect(ctx.styling.tailwind).toBe(true);
    expect(ctx.styling.tailwindVersion).toBe("3.4.0");
  });

  it("detects Tailwind from @tailwindcss/vite plugin", async () => {
    await writePkg({}, { "@tailwindcss/vite": "^4.0.0" });
    const ctx = await detectProject(testDir);
    expect(ctx.styling.tailwind).toBe(true);
  });

  it("detects Tailwind from tailwind.config.ts file", async () => {
    await writePkg({});
    await writeFile(join(testDir, "tailwind.config.ts"), "export default {}");
    const ctx = await detectProject(testDir);
    expect(ctx.styling.tailwind).toBe(true);
  });

  it("reports no Tailwind when absent", async () => {
    await writePkg({ react: "^18.0.0" });
    const ctx = await detectProject(testDir);
    expect(ctx.styling.tailwind).toBe(false);
    expect(ctx.styling.tailwindVersion).toBeUndefined();
  });
});

describe("detectProject — shadcn detection", () => {
  it("detects shadcn from components.json", async () => {
    await writePkg({});
    await writeFile(
      join(testDir, "components.json"),
      JSON.stringify({ style: "default", rsc: true, tsx: true })
    );
    const ctx = await detectProject(testDir);
    expect(ctx.shadcn.installed).toBe(true);
    expect(ctx.shadcn.config).toBeDefined();
    expect(ctx.shadcn.config!.style).toBe("default");
  });

  it("lists installed shadcn components from ui directory", async () => {
    await writePkg({});
    await writeFile(join(testDir, "components.json"), JSON.stringify({ style: "default" }));
    const uiDir = join(testDir, "components", "ui");
    await mkdir(uiDir, { recursive: true });
    await writeFile(join(uiDir, "button.tsx"), "export {}");
    await writeFile(join(uiDir, "card.tsx"), "export {}");
    await writeFile(join(uiDir, "badge.tsx"), "export {}");

    const ctx = await detectProject(testDir);
    expect(ctx.shadcn.components.sort()).toEqual(["badge", "button", "card"]);
  });

  it("reports shadcn not installed when components.json missing", async () => {
    await writePkg({});
    const ctx = await detectProject(testDir);
    expect(ctx.shadcn.installed).toBe(false);
    expect(ctx.shadcn.components).toEqual([]);
  });
});

describe("detectProject — paths detection", () => {
  it("detects src/components path when it exists", async () => {
    await writePkg({});
    await mkdir(join(testDir, "src", "components"), { recursive: true });
    const ctx = await detectProject(testDir);
    expect(ctx.paths.components).toBe("src/components");
  });

  it("detects components path at root level", async () => {
    await writePkg({});
    await mkdir(join(testDir, "components"), { recursive: true });
    const ctx = await detectProject(testDir);
    expect(ctx.paths.components).toBe("components");
  });

  it("detects public directory", async () => {
    await writePkg({});
    await mkdir(join(testDir, "public"), { recursive: true });
    const ctx = await detectProject(testDir);
    expect(ctx.paths.public).toBe("public");
  });

  it("sets detectedAt timestamp", async () => {
    await writePkg({});
    const before = new Date().toISOString();
    const ctx = await detectProject(testDir);
    expect(ctx.detectedAt).toBeDefined();
    expect(new Date(ctx.detectedAt).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime() - 1000);
  });
});
