import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

export type AppQualitySeverity = "critical" | "high" | "medium" | "low";
export type AppQualityCategory =
  | "visual-system"
  | "typography"
  | "spacing"
  | "color"
  | "components"
  | "accessibility"
  | "responsive"
  | "maintainability";

export interface AppQualityIssue {
  id: string;
  category: AppQualityCategory;
  severity: AppQualitySeverity;
  title: string;
  detail: string;
  evidence: string[];
  recommendation: string;
}

export interface AppQualityDirection {
  id: string;
  name: string;
  fit: string;
  tokenMoves: string[];
  componentMoves: string[];
  patchScope: string[];
}

export interface AppQualityFileSignal {
  path: string;
  kind: "component" | "route" | "style" | "config" | "markup";
  classCount: number;
  shadcnImports: string[];
  hexColors: string[];
  cssVariables: string[];
}

export interface AppQualityDiagnosis {
  version: 1;
  target: string;
  generatedAt: string;
  summary: {
    score: number;
    verdict: string;
    scannedFiles: number;
    routes: number;
    components: number;
    styleFiles: number;
    tailwindClasses: number;
    shadcnImports: number;
    cssVariables: number;
    hexColors: number;
  };
  scores: Record<AppQualityCategory, number>;
  files: AppQualityFileSignal[];
  issues: AppQualityIssue[];
  directions: AppQualityDirection[];
  nextActions: string[];
}

interface ScanOptions {
  target?: string;
  projectRoot: string;
  maxFiles?: number;
  write?: boolean;
}

interface RawFile {
  path: string;
  absolutePath: string;
  content: string;
}

const DEFAULT_MAX_FILES = 500;
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".html", ".css"]);
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vite",
  "coverage",
  "dist",
  "build",
  "node_modules",
  "out",
]);

const CATEGORY_BASE: Record<AppQualityCategory, number> = {
  "visual-system": 100,
  typography: 100,
  spacing: 100,
  color: 100,
  components: 100,
  accessibility: 100,
  responsive: 100,
  maintainability: 100,
};

export async function diagnoseAppQuality(options: ScanOptions): Promise<AppQualityDiagnosis> {
  const target = options.target ?? options.projectRoot;
  const files = await loadTargetFiles(options.projectRoot, target, options.maxFiles ?? DEFAULT_MAX_FILES);
  const fileSignals = files.map(analyzeFile);
  const aggregate = aggregateSignals(files, fileSignals);
  const issues = buildIssues(aggregate);
  const scores = scoreCategories(issues);
  const score = Math.round(Object.values(scores).reduce((sum, value) => sum + value, 0) / Object.values(scores).length);

  const diagnosis: AppQualityDiagnosis = {
    version: 1,
    target,
    generatedAt: new Date().toISOString(),
    summary: {
      score,
      verdict: verdictForScore(score),
      scannedFiles: files.length,
      routes: fileSignals.filter((file) => file.kind === "route").length,
      components: fileSignals.filter((file) => file.kind === "component").length,
      styleFiles: fileSignals.filter((file) => file.kind === "style").length,
      tailwindClasses: aggregate.classTokens.length,
      shadcnImports: aggregate.shadcnImports.length,
      cssVariables: aggregate.cssVariables.length,
      hexColors: aggregate.hexColors.length,
    },
    scores,
    files: fileSignals,
    issues,
    directions: buildDirections(aggregate, issues),
    nextActions: [
      "Run `memi diagnose --json` in CI to track design debt over time.",
      "Start with the highest-severity issue before applying visual directions.",
      "Use `memi theme import` or `memi publish` after the improved system is stable.",
    ],
  };

  if (options.write !== false) {
    await writeDiagnosis(options.projectRoot, diagnosis);
  }

  return diagnosis;
}

async function loadTargetFiles(projectRoot: string, target: string, maxFiles: number): Promise<RawFile[]> {
  if (/^https?:\/\//i.test(target)) {
    return [await fetchTarget(target)];
  }

  const absoluteTarget = resolve(projectRoot, target);
  const targetStat = await stat(absoluteTarget);
  if (targetStat.isFile()) {
    const content = await readFile(absoluteTarget, "utf-8");
    return [{ path: relative(projectRoot, absoluteTarget) || target, absolutePath: absoluteTarget, content }];
  }

  const candidates: string[] = [];
  await walk(absoluteTarget, candidates, maxFiles);
  const files: RawFile[] = [];
  for (const absolutePath of candidates.slice(0, maxFiles)) {
    const content = await readFile(absolutePath, "utf-8");
    files.push({ path: relative(projectRoot, absolutePath), absolutePath, content });
  }
  return files;
}

async function fetchTarget(url: string): Promise<RawFile> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  const content = await response.text();
  return { path: url, absolutePath: url, content };
}

async function walk(dir: string, files: string[], maxFiles: number): Promise<void> {
  if (files.length >= maxFiles) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= maxFiles) return;
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) await walk(absolutePath, files, maxFiles);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = extensionOf(entry.name);
    if (SOURCE_EXTENSIONS.has(ext)) files.push(absolutePath);
  }
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx) : "";
}

function analyzeFile(file: RawFile): AppQualityFileSignal {
  const classTokens = extractClassTokens(file.content);
  const shadcnImports = [...file.content.matchAll(/from\s+["'][^"']*components\/ui\/([^"']+)["']/g)]
    .map((match) => match[1].replace(/\.(tsx?|jsx?)$/, ""));
  const hexColors = [...file.content.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]);
  const cssVariables = [...file.content.matchAll(/--[a-zA-Z0-9-_]+/g)].map((match) => match[0]);

  return {
    path: file.path,
    kind: classifyFile(file.path),
    classCount: classTokens.length,
    shadcnImports: [...new Set(shadcnImports)],
    hexColors: [...new Set(hexColors)],
    cssVariables: [...new Set(cssVariables)],
  };
}

function classifyFile(path: string): AppQualityFileSignal["kind"] {
  if (/(\.css|tailwind\.config|components\.json)$/.test(path)) return "style";
  if (/(^|\/)(app|pages|routes)\//.test(path) || /page\.(tsx|jsx|ts|js|html)$/.test(path)) return "route";
  if (/(^|\/)components\//.test(path)) return "component";
  if (/\.html$/.test(path)) return "markup";
  return "config";
}

function extractClassTokens(content: string): string[] {
  const chunks: string[] = [];
  const patterns = [
    /className\s*=\s*["']([^"']+)["']/g,
    /class\s*=\s*["']([^"']+)["']/g,
    /className\s*=\s*\{`([^`]+)`\}/g,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      chunks.push(match[1]);
    }
  }
  return chunks.flatMap((chunk) => chunk.split(/\s+/)).map((token) => token.trim()).filter(Boolean);
}

function aggregateSignals(files: RawFile[], fileSignals: AppQualityFileSignal[]) {
  const allContent = files.map((file) => file.content).join("\n");
  const classTokens = files.flatMap((file) => extractClassTokens(file.content));
  const spacing = classTokens.filter((token) => /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml|gap|space-[xy])-/.test(stripVariants(token)));
  const textSizes = classTokens.filter((token) => /^text-(xs|sm|base|lg|xl|[2-9]xl|\[[^\]]+\])$/.test(stripVariants(token)));
  const colors = classTokens.filter((token) => /(bg|text|border|ring|from|to|via)-/.test(stripVariants(token)));
  const radius = classTokens.filter((token) => /^rounded/.test(stripVariants(token)));
  const shadows = classTokens.filter((token) => /^shadow/.test(stripVariants(token)));
  const responsive = classTokens.filter((token) => /^(sm|md|lg|xl|2xl):/.test(token));
  const arbitrary = classTokens.filter((token) => /\[[^\]]+\]/.test(token));
  const shadcnImports = fileSignals.flatMap((file) => file.shadcnImports);
  const hexColors = fileSignals.flatMap((file) => file.hexColors);
  const cssVariables = fileSignals.flatMap((file) => file.cssVariables);
  const buttons = (allContent.match(/<button\b|<Button\b/g) ?? []).length;
  const images = (allContent.match(/<img\b|<Image\b/g) ?? []).length;
  const imagesWithAlt = (allContent.match(/<(?:img|Image)\b[^>]*\salt=/g) ?? []).length;
  const interactive = (allContent.match(/onClick=|<button\b|<Button\b|role=["']button/g) ?? []).length;
  const focusClasses = classTokens.filter((token) => /focus:|focus-visible:/.test(token));

  return {
    classTokens,
    spacing,
    textSizes,
    colors,
    radius,
    shadows,
    responsive,
    arbitrary,
    shadcnImports,
    hexColors,
    cssVariables,
    buttons,
    images,
    imagesWithAlt,
    interactive,
    focusClasses,
    styleFiles: fileSignals.filter((file) => file.kind === "style"),
    componentFiles: fileSignals.filter((file) => file.kind === "component"),
    routeFiles: fileSignals.filter((file) => file.kind === "route"),
  };
}

function stripVariants(token: string): string {
  const parts = token.split(":");
  return parts.at(-1) ?? token;
}

function buildIssues(aggregate: ReturnType<typeof aggregateSignals>): AppQualityIssue[] {
  const issues: AppQualityIssue[] = [];
  const spacingScale = new Set(aggregate.spacing.map(stripVariants));
  const textScale = new Set(aggregate.textSizes.map(stripVariants));
  const radiusScale = new Set(aggregate.radius.map(stripVariants));
  const shadowScale = new Set(aggregate.shadows.map(stripVariants));
  const colorScale = new Set(aggregate.colors.map(stripVariants));

  if (aggregate.classTokens.length === 0) {
    issues.push(issue("scan.empty", "visual-system", "high", "No UI class signal found", "Memoire could not find Tailwind or HTML class usage in the scanned target.", ["0 class tokens"], "Run this against a route, app directory, or built HTML page with visible UI."));
  }
  if (aggregate.cssVariables.length < 8 && aggregate.classTokens.length > 5) {
    issues.push(issue("system.tokens.missing", "visual-system", "high", "Weak token backbone", "The app has enough UI surface to need a token layer, but very few CSS variables were detected.", [`${aggregate.cssVariables.length} CSS variable references`], "Define color, radius, spacing, and font variables before widening the visual system."));
  }
  if (aggregate.hexColors.length > 0) {
    const severity: AppQualitySeverity = new Set(aggregate.hexColors).size > 4 ? "high" : "medium";
    issues.push(issue("color.raw-hex", "color", severity, "Raw colors are leaking into UI code", "Hardcoded hex values make redesigns brittle and block consistent theme generation.", [`${new Set(aggregate.hexColors).size} unique hex colors`], "Move recurring colors into CSS variables or Tailwind theme tokens."));
  }
  if (colorScale.size > 28) {
    issues.push(issue("color.scale-wide", "color", "medium", "Color utility surface is too wide", "A broad color utility set usually means states and surfaces are being styled case by case.", [`${colorScale.size} unique color utilities`], "Collapse colors into semantic roles: background, surface, foreground, muted, primary, destructive, success, warning."));
  }
  if (textScale.size > 7) {
    issues.push(issue("type.scale-wide", "typography", "medium", "Typography scale is drifting", "Many text sizes make hierarchy harder to read and harder to maintain.", [`${textScale.size} text size utilities`], "Use a tighter type ramp and reserve large sizes for page-level hierarchy."));
  }
  if (spacingScale.size > 22) {
    issues.push(issue("spacing.scale-wide", "spacing", "medium", "Spacing scale is too loose", "Large spacing variety creates an uneven rhythm across routes and components.", [`${spacingScale.size} spacing utilities`], "Normalize spacing around a smaller set of layout and component gaps."));
  }
  if (radiusScale.size > 5) {
    issues.push(issue("shape.radius-drift", "visual-system", "medium", "Radius styles are inconsistent", "Too many radius values makes primitives feel like they came from different systems.", [`${radiusScale.size} radius utilities`], "Pick one default radius, one small radius, and one full radius for pills/avatars."));
  }
  if (shadowScale.size > 4) {
    issues.push(issue("depth.shadow-drift", "visual-system", "medium", "Shadow styles are inconsistent", "Many shadow treatments create noisy depth and weak hierarchy.", [`${shadowScale.size} shadow utilities`], "Define one elevation scale and reserve shadows for layered surfaces."));
  }
  if (aggregate.shadcnImports.length > 4 && aggregate.cssVariables.length < 8) {
    issues.push(issue("components.default-shadcn", "components", "high", "shadcn primitives look under-branded", "The app uses shadcn primitives but does not expose enough token signal to make them feel custom.", [`${aggregate.shadcnImports.length} shadcn imports`, `${aggregate.cssVariables.length} CSS variables`], "Customize shadcn variables, component variants, and state styles before generating more screens."));
  }
  if (aggregate.arbitrary.length > 12) {
    issues.push(issue("maintainability.arbitrary-tailwind", "maintainability", "medium", "Too many arbitrary Tailwind values", "Arbitrary values are useful during exploration but become design debt when repeated.", [`${aggregate.arbitrary.length} arbitrary utilities`], "Promote repeated arbitrary values into tokens or named utilities."));
  }
  if (aggregate.routeFiles.length > 1 && aggregate.responsive.length < Math.max(4, aggregate.routeFiles.length * 2)) {
    issues.push(issue("responsive.coverage-low", "responsive", "medium", "Responsive coverage looks thin", "Multiple routes were found, but responsive utility usage is light.", [`${aggregate.routeFiles.length} routes`, `${aggregate.responsive.length} responsive utilities`], "Audit mobile/tablet layouts and add route-level responsive rules before launch."));
  }
  if (aggregate.images > aggregate.imagesWithAlt) {
    issues.push(issue("a11y.image-alt", "accessibility", "high", "Images need accessible text", "Some rendered images do not appear to include alt text.", [`${aggregate.images - aggregate.imagesWithAlt} image(s) without alt`], "Add meaningful alt text for content images and empty alt text for decorative images."));
  }
  if (aggregate.interactive > 2 && aggregate.focusClasses.length === 0) {
    issues.push(issue("a11y.focus-missing", "accessibility", "high", "Focus states are not visible in code", "Interactive UI was found, but no focus-visible styling was detected.", [`${aggregate.interactive} interactive signals`, "0 focus utilities"], "Add visible focus states to buttons, links, inputs, menus, and custom interactive controls."));
  }

  return issues.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

function issue(
  id: string,
  category: AppQualityCategory,
  severity: AppQualitySeverity,
  title: string,
  detail: string,
  evidence: string[],
  recommendation: string,
): AppQualityIssue {
  return { id, category, severity, title, detail, evidence, recommendation };
}

function scoreCategories(issues: AppQualityIssue[]): Record<AppQualityCategory, number> {
  const scores = { ...CATEGORY_BASE };
  for (const current of issues) {
    const penalty = current.severity === "critical" ? 30
      : current.severity === "high" ? 20
        : current.severity === "medium" ? 12
          : 6;
    scores[current.category] = Math.max(0, scores[current.category] - penalty);
  }
  return scores;
}

function severityRank(severity: AppQualitySeverity): number {
  return severity === "critical" ? 4 : severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function verdictForScore(score: number): string {
  if (score >= 90) return "strong";
  if (score >= 75) return "usable but uneven";
  if (score >= 60) return "visibly inconsistent";
  return "needs a design-system pass";
}

function buildDirections(
  aggregate: ReturnType<typeof aggregateSignals>,
  issues: AppQualityIssue[],
): AppQualityDirection[] {
  const hasDashboard = aggregate.routeFiles.some((file) => /dashboard|admin|analytics/i.test(file.path));
  const hasDocs = aggregate.routeFiles.some((file) => /docs|blog|article|marketing/i.test(file.path));
  const baseScope = [
    "Normalize CSS variables and Tailwind theme tokens",
    "Unify Button, Card, Input, Badge, and navigation variants",
    "Patch route-level spacing and responsive rules",
  ];

  return [
    {
      id: "premium-saas",
      name: "Premium SaaS",
      fit: hasDashboard ? "Best for dashboards, admin tools, and B2B workflows." : "Best for product-led web apps with forms and account flows.",
      tokenMoves: ["Tighter neutral surfaces", "One strong accent", "Reduced radius drift", "Cleaner type hierarchy"],
      componentMoves: ["Primary/secondary/destructive button split", "Sharper card headers", "Intentional empty and loading states"],
      patchScope: baseScope,
    },
    {
      id: "dense-ops",
      name: "Dense Ops",
      fit: "Best when users scan tables, metrics, alerts, and repeated controls all day.",
      tokenMoves: ["Compact spacing scale", "High-contrast state colors", "Clear borders over heavy shadows", "Smaller text ramp"],
      componentMoves: ["Compact table rows", "Status badges", "Toolbar-first forms", "Keyboard-visible focus"],
      patchScope: [...baseScope, "Reduce low-value whitespace on data-heavy routes"],
    },
    {
      id: "editorial-product",
      name: "Editorial Product",
      fit: hasDocs ? "Best for docs, knowledge products, landing pages, and content-heavy SaaS." : "Best for apps that need more trust and narrative polish.",
      tokenMoves: ["More deliberate font pairing", "Softer surface contrast", "Wider reading rhythm", " restrained accent use"],
      componentMoves: ["Better section hierarchy", "Reading-friendly cards", "Stronger forms and onboarding copy surfaces"],
      patchScope: [...baseScope, "Improve page rhythm and content hierarchy"],
    },
  ].map((direction) => ({
    ...direction,
    patchScope: issues.length > 0 ? direction.patchScope : ["Preserve current system and add CI checks"],
  }));
}

async function writeDiagnosis(projectRoot: string, diagnosis: AppQualityDiagnosis): Promise<void> {
  const outDir = join(projectRoot, ".memoire", "app-quality");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "diagnosis.json"), JSON.stringify(diagnosis, null, 2) + "\n", "utf-8");
  await writeFile(join(outDir, "diagnosis.md"), renderDiagnosisMarkdown(diagnosis), "utf-8");
}

function renderDiagnosisMarkdown(diagnosis: AppQualityDiagnosis): string {
  const lines = [
    "# Memoire App Diagnosis",
    "",
    `Target: \`${diagnosis.target}\``,
    `Score: ${diagnosis.summary.score}/100 (${diagnosis.summary.verdict})`,
    `Generated: ${diagnosis.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Files scanned: ${diagnosis.summary.scannedFiles}`,
    `- Routes: ${diagnosis.summary.routes}`,
    `- Components: ${diagnosis.summary.components}`,
    `- Tailwind classes: ${diagnosis.summary.tailwindClasses}`,
    `- shadcn imports: ${diagnosis.summary.shadcnImports}`,
    `- CSS variables: ${diagnosis.summary.cssVariables}`,
    `- Raw hex colors: ${diagnosis.summary.hexColors}`,
    "",
    "## Issues",
    "",
  ];

  if (diagnosis.issues.length === 0) {
    lines.push("- No major app-quality issues detected.");
  } else {
    for (const current of diagnosis.issues) {
      lines.push(`- **${current.severity.toUpperCase()} ${current.category}: ${current.title}**`);
      lines.push(`  ${current.detail}`);
      lines.push(`  Recommendation: ${current.recommendation}`);
    }
  }

  lines.push("", "## Directions", "");
  for (const direction of diagnosis.directions) {
    lines.push(`- **${direction.name}**: ${direction.fit}`);
  }
  lines.push("", "## Next Actions", "");
  for (const action of diagnosis.nextActions) lines.push(`- ${action}`);
  lines.push("");
  return lines.join("\n");
}

export async function hasDiagnosis(projectRoot: string): Promise<boolean> {
  try {
    await access(join(projectRoot, ".memoire", "app-quality", "diagnosis.json"));
    return true;
  } catch {
    return false;
  }
}
