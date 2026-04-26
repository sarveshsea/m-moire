import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAppGraph, type AppGraph } from "./app-graph.js";
import { diagnoseAppQuality, type AppQualityDiagnosis, type AppQualityIssue } from "./engine.js";

export type UiFixCategory = "tokens" | "accessibility" | "components" | "responsive" | "code-health";
export type UiFixRisk = "safe" | "review" | "manual";

export interface UiFixOperation {
  type: "replace" | "insert" | "annotate" | "extract-token";
  file: string;
  description: string;
  search?: string;
  replacement?: string;
  line?: number;
}

export interface UiFixPatch {
  id: string;
  title: string;
  category: UiFixCategory;
  risk: UiFixRisk;
  confidence: number;
  affectedFiles: string[];
  rationale: string;
  operations: UiFixOperation[];
  writeSafe: boolean;
}

export interface UiFixPlan {
  version: 1;
  generatedAt: string;
  target: string;
  summary: {
    patchCount: number;
    safePatchCount: number;
    reviewPatchCount: number;
    manualPatchCount: number;
  };
  patches: UiFixPatch[];
  caveats: string[];
}

export interface BuildUiFixPlanOptions {
  projectRoot: string;
  target?: string;
  maxFiles?: number;
  write?: boolean;
}

export async function buildUiFixPlan(options: BuildUiFixPlanOptions): Promise<UiFixPlan> {
  const target = options.target ?? options.projectRoot;
  const diagnosis = await diagnoseAppQuality({
    projectRoot: options.projectRoot,
    target,
    maxFiles: options.maxFiles,
    write: false,
  });
  const graph = await buildAppGraph({
    projectRoot: options.projectRoot,
    target,
    maxFiles: options.maxFiles,
  });
  const patches = dedupePatches([
    ...diagnosis.issues.flatMap((issue) => patchesForIssue(issue)),
    ...componentPatternPatches(graph),
    ...shadcnDriftPatches(diagnosis, graph),
  ]);

  const plan: UiFixPlan = {
    version: 1,
    generatedAt: new Date().toISOString(),
    target,
    summary: {
      patchCount: patches.length,
      safePatchCount: patches.filter((patch) => patch.risk === "safe").length,
      reviewPatchCount: patches.filter((patch) => patch.risk === "review").length,
      manualPatchCount: patches.filter((patch) => patch.risk === "manual").length,
    },
    patches,
    caveats: [
      "Plan mode does not modify application source files.",
      "Only patches marked writeSafe are eligible for `memi fix apply --yes`.",
      "Token and component extraction plans require human review before broad rewrites.",
    ],
  };

  if (options.write !== false) {
    await writeFixPlan(options.projectRoot, plan);
  }

  return plan;
}

function patchesForIssue(issue: AppQualityIssue): UiFixPatch[] {
  if (issue.id === "color.raw-hex") {
    return [patchFromIssue(issue, {
      id: "tokens.replace-raw-hex",
      title: "Promote raw hex colors into semantic tokens",
      category: "tokens",
      risk: "review",
      operationType: "extract-token",
      description: "Create CSS variables for repeated raw colors, then replace hardcoded literals.",
      writeSafe: false,
    })];
  }
  if (issue.id === "maintainability.arbitrary-tailwind") {
    return [patchFromIssue(issue, {
      id: "tokens.extract-arbitrary-values",
      title: "Extract repeated arbitrary Tailwind values",
      category: "tokens",
      risk: "review",
      operationType: "extract-token",
      description: "Promote repeated bracket utilities into named Tailwind/theme tokens.",
      writeSafe: false,
    })];
  }
  if (issue.id === "a11y.image-alt") {
    return [patchFromIssue(issue, {
      id: "a11y.add-image-alt-hints",
      title: "Add missing image alt text placeholders",
      category: "accessibility",
      risk: "safe",
      operationType: "insert",
      description: "Add empty alt text placeholders where an image has no alt attribute.",
      writeSafe: true,
    })];
  }
  if (issue.id === "a11y.focus-missing") {
    return [patchFromIssue(issue, {
      id: "a11y.add-focus-visible-states",
      title: "Add visible focus-state classes",
      category: "accessibility",
      risk: "review",
      operationType: "annotate",
      description: "Patch interactive controls with focus-visible ring classes after reviewing component variants.",
      writeSafe: false,
    })];
  }
  if (issue.category === "responsive") {
    return [patchFromIssue(issue, {
      id: "responsive.audit-route-breakpoints",
      title: "Add missing route breakpoint coverage",
      category: "responsive",
      risk: "manual",
      operationType: "annotate",
      description: "Review route layouts and add mobile/tablet breakpoint classes where evidence is thin.",
      writeSafe: false,
    })];
  }
  return [];
}

function patchFromIssue(
  issue: AppQualityIssue,
  config: {
    id: string;
    title: string;
    category: UiFixCategory;
    risk: UiFixRisk;
    operationType: UiFixOperation["type"];
    description: string;
    writeSafe: boolean;
  },
): UiFixPatch {
  const affectedFiles = issue.affectedFiles ?? [];
  const locations: Array<{ file: string; line?: number }> = issue.evidenceLocations?.length
    ? issue.evidenceLocations
    : affectedFiles.map((file) => ({ file }));

  return {
    id: config.id,
    title: config.title,
    category: config.category,
    risk: config.risk,
    confidence: issue.confidence ?? 0.7,
    affectedFiles,
    rationale: issue.detail,
    operations: locations.slice(0, 8).map((location) => ({
      type: config.operationType,
      file: location.file,
      line: location.line,
      description: config.description,
    })),
    writeSafe: config.writeSafe,
  };
}

function componentPatternPatches(graph: AppGraph): UiFixPatch[] {
  const repeated = new Map<string, string[]>();
  for (const route of graph.routes) {
    for (const component of route.components) {
      const files = repeated.get(component) ?? [];
      files.push(route.path);
      repeated.set(component, files);
    }
  }

  return [...repeated.entries()]
    .filter(([, files]) => files.length >= 3)
    .slice(0, 5)
    .map(([component, files]) => ({
      id: `components.extract-${component.toLowerCase()}`,
      title: `Extract repeated ${component} pattern`,
      category: "components" as UiFixCategory,
      risk: "review" as UiFixRisk,
      confidence: 0.76,
      affectedFiles: files,
      rationale: `${component} appears across ${files.length} routes and may be a reusable component pattern.`,
      operations: files.slice(0, 6).map((file) => ({
        type: "annotate" as const,
        file,
        description: `Review repeated ${component} usage and extract a shared shadcn/Mémoire component if the pattern is consistent.`,
      })),
      writeSafe: false,
    }));
}

function shadcnDriftPatches(diagnosis: AppQualityDiagnosis, graph: AppGraph): UiFixPatch[] {
  if (graph.shadcn.components.length === 0) return [];
  if (diagnosis.summary.cssVariables >= 8) return [];
  return [{
    id: "components.shadcn-token-drift",
    title: "Re-tokenize shadcn primitives",
    category: "components",
    risk: "review",
    confidence: 0.82,
    affectedFiles: graph.files.filter((file) => file.shadcnImports.length > 0).map((file) => file.path).slice(0, 10),
    rationale: "shadcn primitives are present, but CSS variable coverage is too low for a branded design system.",
    operations: graph.files.filter((file) => file.shadcnImports.length > 0).slice(0, 8).map((file) => ({
      type: "annotate" as const,
      file: file.path,
      description: "Review component variants against extracted tokens and publish the improved registry.",
    })),
    writeSafe: false,
  }];
}

function dedupePatches(patches: UiFixPatch[]): UiFixPatch[] {
  const seen = new Set<string>();
  const result: UiFixPatch[] = [];
  for (const patch of patches) {
    if (seen.has(patch.id)) continue;
    seen.add(patch.id);
    result.push(patch);
  }
  return result;
}

async function writeFixPlan(projectRoot: string, plan: UiFixPlan): Promise<void> {
  const outDir = join(projectRoot, ".memoire", "app-quality");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "fix-plan.json"), `${JSON.stringify(plan, null, 2)}\n`);
  await writeFile(join(outDir, "fix-plan.md"), renderFixPlanMarkdown(plan));
}

function renderFixPlanMarkdown(plan: UiFixPlan): string {
  const lines = [
    "# Memoire UI Fix Plan",
    "",
    `Target: \`${plan.target}\``,
    `Generated: ${plan.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Patches: ${plan.summary.patchCount}`,
    `- Safe: ${plan.summary.safePatchCount}`,
    `- Review: ${plan.summary.reviewPatchCount}`,
    `- Manual: ${plan.summary.manualPatchCount}`,
    "",
    "## Patches",
    "",
  ];
  for (const patch of plan.patches) {
    lines.push(`- **${patch.title}** (${patch.category}, ${patch.risk}, ${Math.round(patch.confidence * 100)}% confidence)`);
    lines.push(`  ${patch.rationale}`);
    if (patch.affectedFiles.length > 0) lines.push(`  Files: ${patch.affectedFiles.slice(0, 6).join(", ")}`);
  }
  lines.push("", "## Caveats", "");
  for (const caveat of plan.caveats) lines.push(`- ${caveat}`);
  lines.push("");
  return lines.join("\n");
}
