/**
 * Agent Orchestrator — Claude-powered design intelligence system.
 *
 * Decomposes high-level design intents into structured sub-agent tasks,
 * each with rich prompts that maximize Claude's design reasoning.
 *
 * Architecture:
 *   User Intent (natural language)
 *     → Intent Classifier (categorize the request)
 *     → Plan Builder (decompose into sub-tasks)
 *     → Sub-Agent Router (dispatch to specialized handlers)
 *     → Figma Executor (push changes via bridge)
 *     → Result Aggregator (combine and report)
 */

import { createLogger } from "../engine/logger.js";
import type { MemoireEngine } from "../engine/core.js";
import type { DesignToken, DesignSystem, DesignComponent } from "../engine/registry.js";
import type { AnySpec, ComponentSpec, PageSpec, DataVizSpec } from "../specs/types.js";
import type { AgentBoxState } from "../plugin/shared/contracts.js";
import { AGENT_PROMPTS } from "./prompts.js";
import { getAI, type AnthropicClient } from "../ai/index.js";
import { resolveForIntent, wrapWithNotes, type ResolvedSkill } from "../notes/index.js";
import { formatAgentBoxLines, formatAgentBoxName, getAgentBoxKey, sortAgentBoxUpdates, type AgentBoxUpdate, type AgentBoxVisualStatus } from "./agent-box.js";

const log = createLogger("agent-orchestrator");

// ── Types ────────────────────────────────────────────────

export type IntentCategory =
  | "token-update"
  | "component-create"
  | "component-modify"
  | "page-layout"
  | "dataviz-create"
  | "theme-change"
  | "spacing-system"
  | "typography-system"
  | "color-palette"
  | "figma-sync"
  | "code-generate"
  | "design-audit"
  | "design-system-init"
  | "responsive-layout"
  | "accessibility-check"
  | "general";

export interface AgentPlan {
  id: string;
  intent: string;
  category: IntentCategory;
  subTasks: SubTask[];
  context: AgentContext;
  createdAt: string;
}

export interface SubTask {
  id: string;
  name: string;
  agentType: SubAgentType;
  prompt: string;
  dependencies: string[]; // IDs of tasks that must complete first
  targetSpecs?: string[];
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export type SubAgentType =
  | "token-engineer"
  | "component-architect"
  | "layout-designer"
  | "dataviz-specialist"
  | "figma-executor"
  | "code-generator"
  | "design-auditor"
  | "accessibility-checker"
  | "theme-builder"
  | "responsive-specialist";

export interface AgentContext {
  designSystem: DesignSystem;
  specs: AnySpec[];
  figmaConnected: boolean;
  projectFramework?: string;
}

export interface AgentExecutionResult {
  planId: string;
  status: "completed" | "partial" | "failed";
  completedTasks: number;
  totalTasks: number;
  mutations: DesignMutation[];
  figmaSynced: boolean;
}

export interface DesignMutation {
  type: "token-created" | "token-updated" | "token-deleted" | "spec-created" | "spec-updated" | "code-generated" | "figma-pushed";
  target: string;
  detail: string;
  before?: unknown;
  after?: unknown;
}

// ── Intent Classifier ────────────────────────────────────

const INTENT_PATTERNS: [RegExp, IntentCategory][] = [
  // Token operations
  [/\b(color|palette|hue|shade|tint)\b/i, "color-palette"],
  [/\b(spacing|space|gap|padding|margin)\b/i, "spacing-system"],
  [/\b(font|typography|text|type\s?scale|heading)\b/i, "typography-system"],
  [/\b(theme|dark\s?mode|light\s?mode|brand)\b/i, "theme-change"],
  [/\b(token|variable|css\s?var)\b/i, "token-update"],

  // Component operations
  [/\b(create|new|add)\b.*\b(component|widget|element)\b/i, "component-create"],
  [/\b(update|modify|change|edit)\b.*\b(component|widget)\b/i, "component-modify"],
  [/\b(button|card|input|form|modal|dialog|table|nav|header|footer|sidebar)\b/i, "component-create"],

  // Layout operations
  [/\b(page|layout|screen|view)\b/i, "page-layout"],
  [/\b(responsive|breakpoint|mobile|tablet|desktop)\b/i, "responsive-layout"],

  // Dataviz
  [/\b(chart|graph|visualization|dataviz|dashboard\s?chart)\b/i, "dataviz-create"],

  // Meta operations
  [/\b(sync|push|figma)\b/i, "figma-sync"],
  [/\b(generate|build|code|compile)\b/i, "code-generate"],
  [/\b(audit|review|check|lint|validate)\b/i, "design-audit"],
  [/\b(accessibility|a11y|wcag|aria)\b/i, "accessibility-check"],
  [/\b(init|setup|bootstrap|scaffold)\b/i, "design-system-init"],
];

export function classifyIntent(intent: string): IntentCategory {
  // Prevent ReDoS with excessively long intent strings
  if (intent.length > 5000) return "general";

  for (const [pattern, category] of INTENT_PATTERNS) {
    if (pattern.test(intent)) return category;
  }
  return "general";
}

// ── Orchestrator ─────────────────────────────────────────

export class AgentOrchestrator {
  private engine: MemoireEngine;
  private planCounter = 0;
  private taskCounter = 0;
  private onUpdate?: (plan: AgentPlan) => void;

  constructor(engine: MemoireEngine, onUpdate?: (plan: AgentPlan) => void) {
    this.engine = engine;
    this.onUpdate = onUpdate;
  }

  /**
   * Main entry point — take a natural language intent, classify it,
   * build a plan of sub-agent tasks, and execute them.
   */
  async execute(intent: string, options?: { autoSync?: boolean; dryRun?: boolean }): Promise<AgentExecutionResult> {
    const category = classifyIntent(intent);
    log.info({ intent, category }, "Classified design intent");

    // Resolve Mémoire Notes for this intent
    const resolvedNotes = this.engine.notes.loaded
      ? await resolveForIntent(category, this.engine.notes.notes)
      : [];
    if (resolvedNotes.length > 0) {
      log.info({ notes: resolvedNotes.map((n) => n.noteId), category }, "Notes activated for intent");
    }

    const context = await this.buildContext();
    const plan = this.buildPlan(intent, category, context, resolvedNotes);

    log.info({ planId: plan.id, tasks: plan.subTasks.length }, "Execution plan ready");
    this.onUpdate?.(plan);

    if (options?.dryRun) {
      return {
        planId: plan.id,
        status: "completed",
        completedTasks: 0,
        totalTasks: plan.subTasks.length,
        mutations: [],
        figmaSynced: false,
      };
    }

    return this.executePlan(plan, options);
  }

  private async buildContext(): Promise<AgentContext> {
    const ds = this.engine.registry.designSystem;
    const specs = await this.engine.registry.getAllSpecs();
    return {
      designSystem: ds,
      specs,
      figmaConnected: this.engine.figma.isConnected,
      projectFramework: this.engine.project?.framework,
    };
  }

  // ── Plan Building ──────────────────────────────────────

  buildPlan(intent: string, category: IntentCategory, context: AgentContext, resolvedNotes: ResolvedSkill[] = []): AgentPlan {
    const planId = `plan-${++this.planCounter}-${Date.now()}`;

    const subTasks = this.decompose(intent, category, context);

    // Inject resolved Note skills into the first task's prompt
    if (resolvedNotes.length > 0 && subTasks.length > 0) {
      subTasks[0].prompt = wrapWithNotes(subTasks[0].prompt, resolvedNotes);
    }

    return {
      id: planId,
      intent,
      category,
      subTasks,
      context,
      createdAt: new Date().toISOString(),
    };
  }

  private decompose(intent: string, category: IntentCategory, ctx: AgentContext): SubTask[] {
    switch (category) {
      case "color-palette":
        return this.decomposeColorPalette(intent, ctx);
      case "spacing-system":
        return this.decomposeSpacingSystem(intent, ctx);
      case "typography-system":
        return this.decomposeTypographySystem(intent, ctx);
      case "theme-change":
        return this.decomposeThemeChange(intent, ctx);
      case "token-update":
        return this.decomposeTokenUpdate(intent, ctx);
      case "component-create":
        return this.decomposeComponentCreate(intent, ctx);
      case "component-modify":
        return this.decomposeComponentModify(intent, ctx);
      case "page-layout":
        return this.decomposePageLayout(intent, ctx);
      case "dataviz-create":
        return this.decomposeDatavizCreate(intent, ctx);
      case "responsive-layout":
        return this.decomposeResponsiveLayout(intent, ctx);
      case "figma-sync":
        return this.decomposeFigmaSync(intent, ctx);
      case "code-generate":
        return this.decomposeCodeGenerate(intent, ctx);
      case "design-audit":
        return this.decomposeDesignAudit(intent, ctx);
      case "accessibility-check":
        return this.decomposeAccessibilityCheck(intent, ctx);
      case "design-system-init":
        return this.decomposeDesignSystemInit(intent, ctx);
      default:
        return this.decomposeGeneral(intent, ctx);
    }
  }

  private makeTask(
    name: string,
    agentType: SubAgentType,
    prompt: string,
    deps: string[] = [],
    targetSpecs?: string[],
  ): SubTask {
    const id = `task-${++this.taskCounter}`;
    return { id, name, agentType, prompt, dependencies: deps, targetSpecs, status: "pending" };
  }

  // ── Color Palette Decomposition ────────────────────────

  private decomposeColorPalette(intent: string, ctx: AgentContext): SubTask[] {
    const existingColors = ctx.designSystem.tokens.filter((t) => t.type === "color");
    const t1 = this.makeTask(
      "Analyze current color system",
      "token-engineer",
      AGENT_PROMPTS.colorAnalysis(intent, existingColors),
    );
    const t2 = this.makeTask(
      "Generate color palette updates",
      "token-engineer",
      AGENT_PROMPTS.colorGeneration(intent, existingColors),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Apply color tokens to design system",
      "token-engineer",
      AGENT_PROMPTS.tokenApplication("color", intent),
      [t2.id],
    );
    const tasks = [t1, t2, t3];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask(
        "Sync color palette to Figma",
        "figma-executor",
        AGENT_PROMPTS.figmaSync("color-palette", intent),
        [t3.id],
      ));
    }

    return tasks;
  }

  // ── Spacing System Decomposition ───────────────────────

  private decomposeSpacingSystem(intent: string, ctx: AgentContext): SubTask[] {
    const spacingTokens = ctx.designSystem.tokens.filter((t) => t.type === "spacing");
    const t1 = this.makeTask(
      "Analyze spacing scale",
      "token-engineer",
      AGENT_PROMPTS.spacingAnalysis(intent, spacingTokens),
    );
    const t2 = this.makeTask(
      "Generate spacing token updates",
      "token-engineer",
      AGENT_PROMPTS.spacingGeneration(intent, spacingTokens),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Apply spacing tokens",
      "token-engineer",
      AGENT_PROMPTS.tokenApplication("spacing", intent),
      [t2.id],
    );
    const tasks = [t1, t2, t3];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Sync spacing to Figma", "figma-executor", AGENT_PROMPTS.figmaSync("spacing", intent), [t3.id]));
    }

    return tasks;
  }

  // ── Typography System Decomposition ────────────────────

  private decomposeTypographySystem(intent: string, ctx: AgentContext): SubTask[] {
    const typoTokens = ctx.designSystem.tokens.filter((t) => t.type === "typography");
    const t1 = this.makeTask(
      "Analyze type scale",
      "token-engineer",
      AGENT_PROMPTS.typographyAnalysis(intent, typoTokens),
    );
    const t2 = this.makeTask(
      "Generate typography updates",
      "token-engineer",
      AGENT_PROMPTS.typographyGeneration(intent, typoTokens),
      [t1.id],
    );
    const tasks = [t1, t2];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Sync typography to Figma", "figma-executor", AGENT_PROMPTS.figmaSync("typography", intent), [t2.id]));
    }

    return tasks;
  }

  // ── Theme Change Decomposition ─────────────────────────

  private decomposeThemeChange(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Analyze current theme",
      "theme-builder",
      AGENT_PROMPTS.themeAnalysis(intent, ctx.designSystem),
    );
    const t2 = this.makeTask(
      "Generate theme token set",
      "theme-builder",
      AGENT_PROMPTS.themeGeneration(intent, ctx.designSystem),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Update all token modes",
      "token-engineer",
      AGENT_PROMPTS.themeModeUpdate(intent),
      [t2.id],
    );
    const t4 = this.makeTask(
      "Regenerate affected components",
      "code-generator",
      AGENT_PROMPTS.themeCodegen(intent, ctx.specs),
      [t3.id],
    );
    const tasks = [t1, t2, t3, t4];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Push theme to Figma", "figma-executor", AGENT_PROMPTS.figmaSync("theme", intent), [t4.id]));
    }

    return tasks;
  }

  // ── Token Update Decomposition ─────────────────────────

  private decomposeTokenUpdate(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Parse token update intent",
      "token-engineer",
      AGENT_PROMPTS.tokenParse(intent, ctx.designSystem.tokens),
    );
    const t2 = this.makeTask(
      "Apply token mutation",
      "token-engineer",
      AGENT_PROMPTS.tokenApplication("any", intent),
      [t1.id],
    );
    const tasks = [t1, t2];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Sync token to Figma", "figma-executor", AGENT_PROMPTS.figmaSync("token", intent), [t2.id]));
    }

    return tasks;
  }

  // ── Component Create Decomposition ─────────────────────

  private decomposeComponentCreate(intent: string, ctx: AgentContext): SubTask[] {
    const targetSpec = this.resolveTargetSpecName(intent, "component", ctx);

    // Pre-check: verify component doesn't already exist via Code Connect
    const existingMappings = ctx.specs
      .filter((s) => s.type === "component")
      .map((s) => {
        const cs = s as { name: string; codeConnect?: { mapped: boolean; codebasePath?: string } };
        const path = cs.codeConnect?.codebasePath ? ` (path: ${cs.codeConnect.codebasePath})` : "";
        return `- ${cs.name}: mapped=${cs.codeConnect?.mapped ?? false}${path}`;
      })
      .join("\n") || "(none)";

    const t0 = this.makeTask(
      "Check Code Connect for existing mappings",
      "component-architect",
      `Before creating a new component, check if it already exists in the codebase via Code Connect.

## Request: "${intent}"
## Target Spec: ${targetSpec}

## Existing Component Specs
${existingMappings}

## Instructions
1. Check get_code_connect_map for existing Figma-to-code mappings
2. If the requested component already exists and is mapped, STOP and use the existing component
3. If not mapped, proceed with creation
4. Return: { exists: boolean, existingPath?: string, proceed: boolean }`,
      [],
      [targetSpec],
    );

    const t1 = this.makeTask(
      "Analyze component requirements",
      "component-architect",
      AGENT_PROMPTS.componentAnalysis(intent, ctx.designSystem, ctx.specs),
      [t0.id],
      [targetSpec],
    );
    const t2 = this.makeTask(
      "Design component spec",
      "component-architect",
      AGENT_PROMPTS.componentDesign(intent, ctx.designSystem),
      [t1.id],
      [targetSpec],
    );
    const t3 = this.makeTask(
      "Generate component code",
      "code-generator",
      AGENT_PROMPTS.componentCodegen(intent),
      [t2.id],
      [targetSpec],
    );
    const tasks = [t0, t1, t2, t3];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Create component in Figma", "figma-executor", AGENT_PROMPTS.figmaComponentCreate(intent), [t3.id], [targetSpec]));
    }

    return tasks;
  }

  // ── Component Modify Decomposition ─────────────────────

  private decomposeComponentModify(intent: string, ctx: AgentContext): SubTask[] {
    const targetSpec = this.resolveTargetSpecName(intent, "component", ctx);
    const t1 = this.makeTask(
      "Identify target component",
      "component-architect",
      AGENT_PROMPTS.componentIdentify(intent, ctx.specs),
      [],
      [targetSpec],
    );
    const t2 = this.makeTask(
      "Update component spec",
      "component-architect",
      AGENT_PROMPTS.componentModify(intent),
      [t1.id],
      [targetSpec],
    );
    const t3 = this.makeTask(
      "Regenerate component code",
      "code-generator",
      AGENT_PROMPTS.componentCodegen(intent),
      [t2.id],
      [targetSpec],
    );
    return [t1, t2, t3];
  }

  // ── Page Layout Decomposition ──────────────────────────

  private decomposePageLayout(intent: string, ctx: AgentContext): SubTask[] {
    const targetSpec = this.resolveTargetSpecName(intent, "page", ctx);
    const t1 = this.makeTask(
      "Analyze page requirements",
      "layout-designer",
      AGENT_PROMPTS.pageAnalysis(intent, ctx.specs),
      [],
      [targetSpec],
    );
    const t2 = this.makeTask(
      "Design page layout spec",
      "layout-designer",
      AGENT_PROMPTS.pageDesign(intent, ctx.designSystem, ctx.specs),
      [t1.id],
      [targetSpec],
    );
    const t3 = this.makeTask(
      "Generate page code",
      "code-generator",
      AGENT_PROMPTS.pageCodegen(intent),
      [t2.id],
      [targetSpec],
    );
    const tasks = [t1, t2, t3];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Compose page in Figma", "figma-executor", AGENT_PROMPTS.figmaPageCompose(intent), [t3.id], [targetSpec]));
    }

    return tasks;
  }

  // ── DataViz Create Decomposition ───────────────────────

  private decomposeDatavizCreate(intent: string, ctx: AgentContext): SubTask[] {
    const targetSpec = this.resolveTargetSpecName(intent, "dataviz", ctx);
    const t1 = this.makeTask(
      "Analyze data visualization needs",
      "dataviz-specialist",
      AGENT_PROMPTS.datavizAnalysis(intent),
      [],
      [targetSpec],
    );
    const t2 = this.makeTask(
      "Design chart spec",
      "dataviz-specialist",
      AGENT_PROMPTS.datavizDesign(intent, ctx.designSystem),
      [t1.id],
      [targetSpec],
    );
    const t3 = this.makeTask(
      "Generate chart code",
      "code-generator",
      AGENT_PROMPTS.datavizCodegen(intent),
      [t2.id],
      [targetSpec],
    );
    return [t1, t2, t3];
  }

  // ── Responsive Layout Decomposition ────────────────────

  private decomposeResponsiveLayout(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Audit responsive breakpoints",
      "responsive-specialist",
      AGENT_PROMPTS.responsiveAudit(intent, ctx.specs),
    );
    const t2 = this.makeTask(
      "Update responsive specs",
      "responsive-specialist",
      AGENT_PROMPTS.responsiveUpdate(intent),
      [t1.id],
    );
    return [t1, t2];
  }

  // ── Figma Sync Decomposition ───────────────────────────

  private decomposeFigmaSync(intent: string, ctx: AgentContext): SubTask[] {
    if (!ctx.figmaConnected) {
      return [this.makeTask("Connect to Figma", "figma-executor", AGENT_PROMPTS.figmaConnect())];
    }
    const t1 = this.makeTask(
      "Pull latest from Figma",
      "figma-executor",
      AGENT_PROMPTS.figmaPull(),
    );
    const t2 = this.makeTask(
      "Diff local vs Figma state",
      "figma-executor",
      AGENT_PROMPTS.figmaDiff(),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Push local changes to Figma",
      "figma-executor",
      AGENT_PROMPTS.figmaSync("full", intent),
      [t2.id],
    );
    return [t1, t2, t3];
  }

  // ── Code Generate Decomposition ────────────────────────

  private decomposeCodeGenerate(intent: string, ctx: AgentContext): SubTask[] {
    const specs = ctx.specs;
    const tasks: SubTask[] = [
      this.makeTask("Validate all specs", "design-auditor", AGENT_PROMPTS.specValidation(specs)),
    ];

    for (const spec of specs) {
      tasks.push(this.makeTask(
        `Generate ${spec.name}`,
        "code-generator",
        AGENT_PROMPTS.specCodegen(spec),
        [tasks[0].id],
        [spec.name],
      ));
    }

    return tasks;
  }

  // ── Design Audit Decomposition ─────────────────────────

  private decomposeDesignAudit(intent: string, ctx: AgentContext): SubTask[] {
    return [
      this.makeTask("Audit token consistency", "design-auditor", AGENT_PROMPTS.auditTokens(ctx.designSystem)),
      this.makeTask("Audit spec completeness", "design-auditor", AGENT_PROMPTS.auditSpecs(ctx.specs)),
      this.makeTask("Audit accessibility", "accessibility-checker", AGENT_PROMPTS.auditAccessibility(ctx.designSystem, ctx.specs)),
      this.makeTask("Generate audit report", "design-auditor", AGENT_PROMPTS.auditReport(intent)),
    ];
  }

  // ── Accessibility Check Decomposition ──────────────────

  private decomposeAccessibilityCheck(intent: string, ctx: AgentContext): SubTask[] {
    return [
      this.makeTask("Check color contrast", "accessibility-checker", AGENT_PROMPTS.a11yContrast(ctx.designSystem)),
      this.makeTask("Check component ARIA", "accessibility-checker", AGENT_PROMPTS.a11yAria(ctx.specs)),
      this.makeTask("Check keyboard navigation", "accessibility-checker", AGENT_PROMPTS.a11yKeyboard(ctx.specs)),
      this.makeTask("Check cognitive accessibility", "accessibility-checker", AGENT_PROMPTS.a11yCognitive(ctx.specs)),
      this.makeTask("Check motion accessibility", "accessibility-checker", AGENT_PROMPTS.a11yMotion(ctx.designSystem, ctx.specs)),
    ];
  }

  // ── Design System Init Decomposition ───────────────────

  private decomposeDesignSystemInit(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Scaffold token foundation",
      "token-engineer",
      AGENT_PROMPTS.initTokens(intent),
    );
    const t2 = this.makeTask(
      "Create base component specs",
      "component-architect",
      AGENT_PROMPTS.initComponents(intent),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Generate initial code",
      "code-generator",
      AGENT_PROMPTS.initCodegen(),
      [t2.id],
    );
    return [t1, t2, t3];
  }

  // ── General Decomposition ──────────────────────────────

  private decomposeGeneral(intent: string, ctx: AgentContext): SubTask[] {
    return [
      this.makeTask("Analyze design intent", "design-auditor", AGENT_PROMPTS.generalAnalysis(intent, ctx)),
      this.makeTask("Execute design operation", "component-architect", AGENT_PROMPTS.generalExecute(intent)),
    ];
  }

  // ── Plan Execution Engine ──────────────────────────────

  private async executePlan(plan: AgentPlan, options?: { autoSync?: boolean }): Promise<AgentExecutionResult> {
    const mutations: DesignMutation[] = [];
    let completedTasks = 0;
    const completed = new Set<string>();
    const totalTasks = plan.subTasks.length;

    await Promise.all(
      sortAgentBoxUpdates(
        plan.subTasks.map((task, index) => this.makeAgentBoxUpdate(plan, task, index, "idle")),
      ).map((update) => this.updateAgentBox(update)),
    );

    // Topological execution — respect dependencies
    while (completed.size < plan.subTasks.length) {
      const ready = plan.subTasks.filter(
        (t) => t.status === "pending" && t.dependencies.every((d) => completed.has(d)),
      );

      if (ready.length === 0 && completed.size < plan.subTasks.length) {
        // Deadlock — remaining tasks have unsatisfied dependencies
        const stuck = plan.subTasks.filter((t) => !completed.has(t.id));
        const stuckNames = stuck.map((t) => `${t.name} (deps: ${t.dependencies.join(", ")})`);
        log.error(
          { stuck: stuckNames, completed: Array.from(completed) },
          "Task dependency deadlock — %d tasks blocked, breaking execution",
          stuck.length,
        );
        for (const task of stuck) {
          if (task.status === "pending") {
            task.status = "failed";
            task.error = `Deadlocked: depends on ${task.dependencies.filter((d) => !completed.has(d)).join(", ")}`;
            task.completedAt = new Date().toISOString();
          }
        }
        break;
      }

      // Execute ready tasks in parallel
      await Promise.all(
        ready.map(async (task) => {
          const taskIndex = plan.subTasks.findIndex((candidate) => candidate.id === task.id);
          task.status = "running";
          task.startedAt = new Date().toISOString();
          this.onUpdate?.(plan);

          await this.updateAgentBox(this.makeAgentBoxUpdate(plan, task, taskIndex, "busy"));

          try {
            const result = await this.executeWithRetry(task, plan.context);
            task.status = "completed";
            task.result = result;
            task.completedAt = new Date().toISOString();
            completedTasks++;

            await this.updateAgentBox(
              this.makeAgentBoxUpdate(plan, task, taskIndex, "done", result),
            );

            if (result && typeof result === "object" && "mutations" in result) {
              mutations.push(...(result as { mutations: DesignMutation[] }).mutations);
            }
          } catch (err) {
            task.status = "failed";
            task.error = err instanceof Error ? err.message : String(err);
            task.completedAt = new Date().toISOString();

            await this.updateAgentBox(
              this.makeAgentBoxUpdate(plan, task, taskIndex, "error"),
            );
          }

          completed.add(task.id);
          this.onUpdate?.(plan);
        }),
      );
    }

    // Auto-sync to Figma if requested
    let figmaSynced = false;
    if (options?.autoSync && plan.context.figmaConnected && mutations.length > 0) {
      try {
        await this.syncMutationsToFigma(mutations);
        figmaSynced = true;
      } catch (err) {
        log.warn({ err }, "Auto-sync to Figma failed");
      }
    }

    return {
      planId: plan.id,
      status: completedTasks === totalTasks ? "completed" : completedTasks > 0 ? "partial" : "failed",
      completedTasks,
      totalTasks,
      mutations,
      figmaSynced,
    };
  }

  // ── AI-Powered Sub-Agent Types ──────────────────────────

  private static readonly AI_AGENT_TYPES: SubAgentType[] = [
    "token-engineer",
    "design-auditor",
    "accessibility-checker",
    "theme-builder",
    "responsive-specialist",
  ];

  // ── Sub-Agent Execution ────────────────────────────────

  private static readonly MAX_RETRIES = 2;
  private static readonly RETRY_BASE_MS = 500;

  private async executeWithRetry(task: SubTask, ctx: AgentContext): Promise<unknown> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= AgentOrchestrator.MAX_RETRIES; attempt++) {
      try {
        return await this.executeSubTask(task, ctx);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < AgentOrchestrator.MAX_RETRIES) {
          const delayMs = AgentOrchestrator.RETRY_BASE_MS * Math.pow(2, attempt);
          log.warn(
            { taskId: task.id, attempt: attempt + 1, delayMs, err: lastError.message },
            "Sub-task failed, retrying",
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw lastError ?? new Error("Sub-task failed with no error captured");
  }

  private async executeSubTask(task: SubTask, ctx: AgentContext): Promise<unknown> {
    log.info({ taskId: task.id, agent: task.agentType, name: task.name }, "Executing sub-task");

    // Try AI-powered execution first if available
    const ai = getAI();
    if (ai && AgentOrchestrator.AI_AGENT_TYPES.includes(task.agentType)) {
      try {
        const aiResult = await this.aiExecuteSubTask(ai, task, ctx);
        if (aiResult) return aiResult;
      } catch (err) {
        log.warn({ taskId: task.id, err: err instanceof Error ? err.message : String(err) }, "AI execution failed, falling back to heuristic");
      }
    }

    switch (task.agentType) {
      case "token-engineer":
        return this.executeTokenEngineer(task, ctx);
      case "component-architect":
        return this.executeComponentArchitect(task, ctx);
      case "layout-designer":
        return this.executeLayoutDesigner(task, ctx);
      case "dataviz-specialist":
        return this.executeDatavizSpecialist(task, ctx);
      case "figma-executor":
        return this.executeFigmaAgent(task, ctx);
      case "code-generator":
        return this.executeCodeGenerator(task, ctx);
      case "design-auditor":
        return this.executeDesignAuditor(task, ctx);
      case "accessibility-checker":
        return this.executeAccessibilityChecker(task, ctx);
      case "theme-builder":
        return this.executeThemeBuilder(task, ctx);
      case "responsive-specialist":
        return this.executeResponsiveSpecialist(task, ctx);
      default:
        log.warn({ agentType: task.agentType }, "Unknown sub-agent type");
        return { status: "skipped" };
    }
  }

  // ── Token Engineer Sub-Agent ───────────────────────────

  private async executeTokenEngineer(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const mutations: DesignMutation[] = [];
    const ds = this.engine.registry.designSystem;

    // The task prompt already contains the analysis context.
    // Here we execute the actual token mutations.
    if (task.name.includes("Apply") || task.name.includes("Update") || task.name.includes("Generate")) {
      // Token mutation logic based on task prompt context
      log.info({ task: task.name }, "Token engineer executing mutation");
    }

    return { status: "completed", mutations, tokenCount: ds.tokens.length };
  }

  // ── Component Architect Sub-Agent ──────────────────────

  private async executeComponentArchitect(task: SubTask, ctx: AgentContext): Promise<unknown> {
    if (task.name.includes("Design") || task.name.includes("Update") || task.name.includes("Create")) {
      const specName = task.targetSpecs?.[0] ?? this.resolveTargetSpecName(task.prompt, "component", ctx);
      const existing = await this.engine.registry.getSpec(specName);

      const componentSpec: ComponentSpec = existing?.type === "component"
        ? {
            ...existing,
            updatedAt: new Date().toISOString(),
          }
        : this.scaffoldComponentSpec(specName, task.prompt);

      await this.engine.registry.saveSpec(componentSpec);
      this.upsertContextSpec(ctx, componentSpec);

      const mutationType: DesignMutation["type"] = existing ? "spec-updated" : "spec-created";
      return {
        status: "completed",
        targetSpecs: [componentSpec.name],
        mutations: [{
          type: mutationType,
          target: componentSpec.name,
          detail: `${existing ? "Updated" : "Created"} component spec ${componentSpec.name}`,
          after: componentSpec,
        }],
      };
    }

    return { status: "completed", targetSpecs: task.targetSpecs ?? [] };
  }

  // ── Layout Designer Sub-Agent ──────────────────────────

  private async executeLayoutDesigner(task: SubTask, ctx: AgentContext): Promise<unknown> {
    log.info({ task: task.name }, "Layout designer processing");

    if (task.name.includes("Design")) {
      const specName = task.targetSpecs?.[0] ?? this.resolveTargetSpecName(task.prompt, "page", ctx);
      const existing = await this.engine.registry.getSpec(specName);

      const pageSpec: PageSpec = existing?.type === "page"
        ? {
            ...existing,
            updatedAt: new Date().toISOString(),
          }
        : this.scaffoldPageSpec(specName, task.prompt, ctx);

      await this.engine.registry.saveSpec(pageSpec);
      this.upsertContextSpec(ctx, pageSpec);

      const mutationType: DesignMutation["type"] = existing ? "spec-updated" : "spec-created";
      return {
        status: "completed",
        targetSpecs: [pageSpec.name],
        mutations: [{
          type: mutationType,
          target: pageSpec.name,
          detail: `${existing ? "Updated" : "Created"} page spec ${pageSpec.name}`,
          after: pageSpec,
        }],
      };
    }

    return { status: "completed", targetSpecs: task.targetSpecs ?? [] };
  }

  // ── Dataviz Specialist Sub-Agent ───────────────────────

  private async executeDatavizSpecialist(task: SubTask, ctx: AgentContext): Promise<unknown> {
    log.info({ task: task.name }, "Dataviz specialist processing");

    if (task.name.includes("Design")) {
      const specName = task.targetSpecs?.[0] ?? this.resolveTargetSpecName(task.prompt, "dataviz", ctx);
      const existing = await this.engine.registry.getSpec(specName);

      const datavizSpec: DataVizSpec = existing?.type === "dataviz"
        ? {
            ...existing,
            updatedAt: new Date().toISOString(),
          }
        : this.scaffoldDataVizSpec(specName, task.prompt);

      await this.engine.registry.saveSpec(datavizSpec);
      this.upsertContextSpec(ctx, datavizSpec);

      const mutationType: DesignMutation["type"] = existing ? "spec-updated" : "spec-created";
      return {
        status: "completed",
        targetSpecs: [datavizSpec.name],
        mutations: [{
          type: mutationType,
          target: datavizSpec.name,
          detail: `${existing ? "Updated" : "Created"} dataviz spec ${datavizSpec.name}`,
          after: datavizSpec,
        }],
      };
    }

    return { status: "completed", targetSpecs: task.targetSpecs ?? [] };
  }

  // ── Figma Executor Sub-Agent ───────────────────────────

  private async executeFigmaAgent(task: SubTask, ctx: AgentContext): Promise<unknown> {
    if (!this.engine.figma.isConnected) {
      throw new Error("Figma not connected");
    }

    if (task.name.includes("Pull")) {
      await this.engine.pullDesignSystem();
      return { status: "completed", action: "pulled" };
    }

    if (task.name.includes("Diff")) {
      // Snapshot local state, pull remote, then compare
      const localBefore = this.engine.registry.designSystem;
      const localTokenCount = localBefore.tokens.length;
      const localComponentCount = localBefore.components.length;

      await this.engine.pullDesignSystem();

      const afterPull = this.engine.registry.designSystem;
      return {
        status: "completed",
        action: "diffed",
        localTokensBefore: localTokenCount,
        localComponentsBefore: localComponentCount,
        remoteTokens: afterPull.tokens.length,
        remoteComponents: afterPull.components.length,
        tokenDelta: afterPull.tokens.length - localTokenCount,
        componentDelta: afterPull.components.length - localComponentCount,
      };
    }

    if (task.name.includes("Sync") || task.name.includes("Push")) {
      // Push current design system to Figma
      const ds = this.engine.registry.designSystem;
      for (const token of ds.tokens) {
        try {
          await this.pushTokenToFigma(token);
        } catch (err) {
          log.warn({ token: token.name, err }, "Failed to push token");
        }
      }
      return { status: "completed", action: "synced", tokens: ds.tokens.length };
    }

    return { status: "completed" };
  }

  // ── Code Generator Sub-Agent ───────────────────────────

  private async executeCodeGenerator(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const generated: string[] = [];
    const targetSpecs = task.targetSpecs && task.targetSpecs.length > 0
      ? task.targetSpecs
      : task.name.startsWith("Generate ")
        ? ctx.specs.map((spec) => spec.name)
        : [];

    if (targetSpecs.length === 0) {
      return { status: "skipped", generated, mutations: [] };
    }

    for (const specName of targetSpecs) {
      try {
        const file = await this.engine.generateFromSpec(specName);
        generated.push(file);
      } catch (err) {
        log.warn({ spec: specName, err }, "Failed to generate");
      }
    }

    return {
      status: "completed",
      generated,
      mutations: generated.map((f) => ({
        type: "code-generated" as const,
        target: f,
        detail: `Generated ${f}`,
      })),
    };
  }

  private resolveTargetSpecName(
    intent: string,
    kind: "component" | "page" | "dataviz",
    ctx: AgentContext,
  ): string {
    const exactExisting = ctx.specs.find((spec) => new RegExp(`\\b${spec.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(intent));
    if (exactExisting) {
      return exactExisting.name;
    }

    const extracted = this.extractNameFromIntent(intent, kind);
    if (extracted) {
      return extracted;
    }

    const suffix = kind === "page" ? "Page" : kind === "dataviz" ? "Chart" : "Component";
    return `Generated${suffix}`;
  }

  private extractNameFromIntent(intent: string, kind: "component" | "page" | "dataviz"): string | null {
    const patterns: Record<typeof kind, RegExp[]> = {
      component: [
        /\b(?:create|add|build|design|new)\s+(?:a|an|the)?\s*([a-z0-9][a-z0-9\s-]*?)\s+(?:component|widget|element)\b/i,
        /\b(?:create|add|build|design|new)\s+(?:a|an|the)?\s*([a-z0-9][a-z0-9\s-]*?)\s+(button|card|input|form|modal|dialog|table|nav|header|footer|sidebar)\b/i,
      ],
      page: [
        /\b(?:create|add|build|design|compose|new)\s+(?:a|an|the)?\s*([a-z0-9][a-z0-9\s-]*?)\s+(page|screen|view|layout)\b/i,
      ],
      dataviz: [
        /\b(?:create|add|build|design|new)\s+(?:a|an|the)?\s*([a-z0-9][a-z0-9\s-]*?)\s+(chart|graph|visualization|viz)\b/i,
      ],
    };

    for (const pattern of patterns[kind]) {
      const match = intent.match(pattern);
      if (!match) continue;
      const nameParts = match.slice(1).filter(Boolean);
      const normalized = this.toPascalCase(nameParts.join(" "));
      if (!normalized) continue;

      if (kind === "page" && !normalized.endsWith("Page")) return `${normalized}Page`;
      if (kind === "dataviz" && !/(Chart|Graph|Viz)$/i.test(normalized)) return `${normalized}Chart`;
      return normalized;
    }

    return null;
  }

  private toPascalCase(value: string): string {
    return value
      .replace(/[^A-Za-z0-9\s-]/g, " ")
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join("");
  }

  private scaffoldComponentSpec(name: string, intent: string): ComponentSpec {
    const now = new Date().toISOString();
    const shadcnBase = this.inferShadcnBase(intent, "component");
    const primaryBase = shadcnBase[0] ?? "Card";
    const lowerIntent = intent.toLowerCase();
    const level = /\b(form|table|sidebar|header|footer|dialog|modal)\b/.test(lowerIntent)
      ? "organism"
      : /\b(card|search|filter|metric|stat)\b/.test(lowerIntent)
        ? "molecule"
        : "atom";

    return {
      name,
      type: "component",
      level,
      purpose: `${name} component generated from compose intent`,
      researchBacking: [],
      designTokens: { source: "none", mapped: false },
      variants: ["default"],
      props: {},
      shadcnBase,
      composesSpecs: [],
      codeConnect: { props: {}, mapped: false },
      accessibility: {
        role: primaryBase === "Dialog" ? "dialog" : undefined,
        ariaLabel: "optional",
        keyboardNav: /dialog|modal|menu|dropdown|select|sidebar/i.test(lowerIntent),
        focusStyle: "outline",
        touchTarget: "default",
        reducedMotion: false,
        liveRegion: "off",
        colorIndependent: true,
      },
      dataviz: null,
      tags: ["compose-generated"],
      createdAt: now,
      updatedAt: now,
    };
  }

  private scaffoldPageSpec(name: string, intent: string, ctx: AgentContext): PageSpec {
    const now = new Date().toISOString();
    const lowerIntent = intent.toLowerCase();
    const layout: PageSpec["layout"] = lowerIntent.includes("dashboard")
      ? "dashboard"
      : /\b(login|auth|signin|signup)\b/.test(lowerIntent)
        ? "centered"
        : /\blanding|marketing|hero\b/.test(lowerIntent)
          ? "marketing"
          : "full-width";

    const componentSections = ctx.specs
      .filter((spec): spec is ComponentSpec => spec.type === "component")
      .slice(0, layout === "dashboard" ? 3 : 0)
      .map((spec, index) => ({
        name: spec.name.toLowerCase(),
        component: spec.name,
        layout: index === 0 ? "full-width" : "grid-2",
        repeat: 1,
        props: {},
      })) as PageSpec["sections"];

    return {
      name,
      type: "page",
      purpose: `${name} page generated from compose intent`,
      researchBacking: [],
      layout,
      sections: componentSections,
      shadcnLayout: layout === "dashboard" ? ["SidebarProvider", "SidebarInset"] : [],
      responsive: { mobile: "stack", tablet: "grid-2", desktop: layout === "dashboard" ? "grid-4" : "grid-2" },
      accessibility: {
        language: "en",
        landmarks: true,
        skipLink: true,
        headingHierarchy: true,
        consistentNav: true,
        consistentHelp: true,
      },
      meta: {
        title: name.replace(/Page$/, ""),
        description: intent,
      },
      tags: ["compose-generated"],
      createdAt: now,
      updatedAt: now,
    };
  }

  private scaffoldDataVizSpec(name: string, intent: string): DataVizSpec {
    const now = new Date().toISOString();
    const lowerIntent = intent.toLowerCase();
    const chartType: DataVizSpec["chartType"] = lowerIntent.includes("bar")
      ? "bar"
      : lowerIntent.includes("area")
        ? "area"
        : lowerIntent.includes("pie") || lowerIntent.includes("donut")
          ? "donut"
          : lowerIntent.includes("scatter")
            ? "scatter"
            : "line";

    return {
      name,
      type: "dataviz",
      purpose: `${name} chart generated from compose intent`,
      chartType,
      library: "recharts",
      dataShape: { x: "label", y: "value" },
      interactions: ["hover-tooltip"],
      accessibility: { altText: "required", keyboardNav: true, dataTableFallback: true, patternFill: false, announceUpdates: false, highContrastMode: false },
      responsive: {
        mobile: { height: 200, simplify: true },
        desktop: { height: 400 },
      },
      shadcnWrapper: "Card",
      sampleData: [],
      tags: ["compose-generated"],
      createdAt: now,
      updatedAt: now,
    };
  }

  private inferShadcnBase(intent: string, kind: "component" | "page" | "dataviz"): string[] {
    const text = intent.toLowerCase();
    if (kind === "dataviz") return ["Card"];
    if (text.includes("button")) return ["Button"];
    if (text.includes("input")) return ["Input"];
    if (text.includes("form")) return ["Form", "Input", "Label"];
    if (text.includes("dialog") || text.includes("modal")) return ["Dialog"];
    if (text.includes("table")) return ["Table"];
    if (text.includes("sidebar") || text.includes("nav")) return ["Sidebar"];
    if (text.includes("badge")) return ["Badge"];
    return ["Card"];
  }

  private upsertContextSpec(ctx: AgentContext, spec: AnySpec): void {
    const index = ctx.specs.findIndex((entry) => entry.name === spec.name);
    if (index >= 0) {
      ctx.specs[index] = spec;
      return;
    }
    ctx.specs.push(spec);
  }

  // ── Design Auditor Sub-Agent ───────────────────────────

  private async executeDesignAuditor(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const issues: string[] = [];

    // Check for missing token types
    const tokenTypes = new Set(ctx.designSystem.tokens.map((t) => t.type));
    const expectedTypes = ["color", "spacing", "typography", "radius", "shadow"];
    for (const type of expectedTypes) {
      if (!tokenTypes.has(type as DesignToken["type"])) {
        issues.push(`Missing token type: ${type}`);
      }
    }

    // Check specs have required fields
    for (const spec of ctx.specs) {
      if (!spec.purpose) issues.push(`Spec "${spec.name}" missing purpose`);
      if (spec.type === "component") {
        const cs = spec as ComponentSpec;
        if (cs.shadcnBase.length === 0) issues.push(`Component "${cs.name}" has no shadcnBase`);
        if (Object.keys(cs.props).length === 0) issues.push(`Component "${cs.name}" has no props`);
      }
    }

    return { status: "completed", issues, issueCount: issues.length };
  }

  // ── Accessibility Checker Sub-Agent ────────────────────

  private async executeAccessibilityChecker(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const issues: string[] = [];

    // Check color contrast (simplified)
    const colorTokens = ctx.designSystem.tokens.filter((t) => t.type === "color");
    if (colorTokens.length < 2) {
      issues.push("Insufficient color tokens for contrast checking");
    }

    // Check component accessibility
    for (const spec of ctx.specs) {
      if (spec.type === "component") {
        const cs = spec as ComponentSpec;
        if (!cs.accessibility?.ariaLabel) {
          issues.push(`Component "${cs.name}" missing ariaLabel`);
        }
      }
    }

    return { status: "completed", issues, issueCount: issues.length };
  }

  // ── Theme Builder Sub-Agent ────────────────────────────

  private async executeThemeBuilder(task: SubTask, ctx: AgentContext): Promise<unknown> {
    log.info({ task: task.name }, "Theme builder processing");
    return { status: "completed" };
  }

  // ── Responsive Specialist Sub-Agent ────────────────────

  private async executeResponsiveSpecialist(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const pageSpecs = ctx.specs.filter((s) => s.type === "page") as PageSpec[];
    const issues: string[] = [];

    for (const page of pageSpecs) {
      if (!page.responsive?.mobile) issues.push(`Page "${page.name}" missing mobile layout`);
      if (!page.responsive?.tablet) issues.push(`Page "${page.name}" missing tablet layout`);
      if (!page.responsive?.desktop) issues.push(`Page "${page.name}" missing desktop layout`);
    }

    return { status: "completed", issues, pageCount: pageSpecs.length };
  }

  // ── AI-Powered Execution ───────────────────────────────

  private async aiExecuteSubTask(ai: AnthropicClient, task: SubTask, ctx: AgentContext): Promise<unknown> {
    const systemPrompt = this.buildAgentSystemPrompt(task.agentType, ctx);

    const result = await ai.completeJSON<{
      status: string;
      mutations?: Array<{ type: string; target: string; detail: string }>;
      analysis?: string;
      recommendations?: string[];
      issues?: string[];
    }>({
      system: systemPrompt,
      messages: [
        { role: "user", content: task.prompt },
      ],
      model: "fast",
    });

    // Apply any mutations from the AI result
    if (result.mutations && result.mutations.length > 0) {
      for (const m of result.mutations) {
        await this.applyAIResult(m, ctx);
      }
    }

    return {
      status: result.status || "completed",
      mutations: (result.mutations || []).map(m => ({
        type: m.type as DesignMutation["type"],
        target: m.target,
        detail: m.detail,
      })),
      analysis: result.analysis,
      recommendations: result.recommendations,
      issues: result.issues,
      aiPowered: true,
    };
  }

  private buildAgentSystemPrompt(agentType: SubAgentType, ctx: AgentContext): string {
    const roleDesc = this.getAgentRoleDescription(agentType);
    const tokenSummary = ctx.designSystem.tokens.slice(0, 20).map(t =>
      `${t.name}: ${t.type} = ${JSON.stringify(Object.values(t.values)[0])}`
    ).join("\n");

    return [
      `You are a ${agentType} sub-agent in the Memoire design intelligence engine.`,
      `Role: ${roleDesc}`,
      "",
      "Current design system context:",
      `- ${ctx.designSystem.tokens.length} tokens`,
      `- ${ctx.designSystem.components.length} components`,
      `- ${ctx.specs.length} specs`,
      `- Framework: ${ctx.projectFramework || "unknown"}`,
      `- Figma: ${ctx.figmaConnected ? "connected" : "offline"}`,
      "",
      "Token snapshot:",
      tokenSummary,
      "",
      "Return a JSON object with: { status, mutations?, analysis?, recommendations?, issues? }",
      "mutations should be an array of { type, target, detail }",
      "type must be one of: token-created, token-updated, token-deleted, spec-created, spec-updated, code-generated, figma-pushed",
    ].join("\n");
  }

  private getAgentRoleDescription(agentType: SubAgentType): string {
    const roles: Record<SubAgentType, string> = {
      "token-engineer": "Design token expert. Analyze, create, and update design tokens (colors, spacing, typography, shadows, radii).",
      "component-architect": "Component design specialist. Decompose UI into atomic design specs with proper composition.",
      "layout-designer": "Page layout expert. Design responsive page layouts using grid systems and component placement.",
      "dataviz-specialist": "Data visualization expert. Design chart specs with appropriate chart types, axes, and interactions.",
      "figma-executor": "Figma bridge operator. Push and pull design system changes to/from Figma.",
      "code-generator": "Code generation specialist. Transform specs into shadcn/ui + Tailwind components.",
      "design-auditor": "Design system auditor. Review consistency, completeness, and quality of the design system.",
      "accessibility-checker": "Accessibility expert. Check WCAG compliance, contrast ratios, ARIA labels, keyboard nav.",
      "theme-builder": "Theme specialist. Design cohesive color themes with proper semantic token mapping.",
      "responsive-specialist": "Responsive design expert. Ensure layouts work across mobile, tablet, and desktop.",
    };
    return roles[agentType] || "General design agent.";
  }

  private async applyAIResult(mutation: { type: string; target: string; detail: string }, ctx: AgentContext): Promise<void> {
    if (!mutation.type || !mutation.target) {
      log.warn({ mutation }, "Skipping AI mutation — missing type or target");
      return;
    }
    log.info({ type: mutation.type, target: mutation.target }, "Applying AI mutation");

    switch (mutation.type) {
      case "token-created":
      case "token-updated": {
        const existing = this.engine.registry.designSystem.tokens.find(t => t.name === mutation.target);
        if (existing) {
          log.info({ token: mutation.target }, "Token mutation recorded — update via registry");
        }
        break;
      }
      case "token-deleted": {
        this.engine.registry.removeToken(mutation.target);
        break;
      }
      case "spec-created":
      case "spec-updated":
      case "code-generated":
      case "figma-pushed":
        break;
      default:
        log.warn({ type: mutation.type }, "Unknown AI mutation type — recording only");
    }
  }

  // ── Figma Push Helpers ─────────────────────────────────

  private async pushTokenToFigma(token: DesignToken): Promise<void> {
    const value = Object.values(token.values)[0];
    if (!value) return;

    // Validate token name to prevent code injection
    if (!/^[A-Za-z0-9/_\- .]+$/.test(token.name)) {
      log.warn({ token: token.name }, "Skipping Figma push — unsafe token name");
      return;
    }

    // Pass data as serialized JSON payload, not inline template interpolation
    const tokenData = {
      name: String(token.name),
      value: String(value),
      isColor: token.type === "color",
    };

    const code = `
      (async () => {
        const tokenData = JSON.parse(${JSON.stringify(JSON.stringify(tokenData))});
        const collections = await figma.variables.getLocalVariableCollectionsAsync();
        for (const col of collections) {
          const varIds = col.variableIds;
          for (const vid of varIds) {
            const v = await figma.variables.getVariableByIdAsync(vid);
            if (v && v.name === tokenData.name) {
              const modeId = col.modes[0]?.modeId;
              if (modeId) {
                if (tokenData.isColor) {
                  const hex = tokenData.value;
                  const r = parseInt(hex.slice(1,3), 16) / 255;
                  const g = parseInt(hex.slice(3,5), 16) / 255;
                  const b = parseInt(hex.slice(5,7), 16) / 255;
                  v.setValueForMode(modeId, { r, g, b, a: 1 });
                } else {
                  v.setValueForMode(modeId, tokenData.value);
                }
              }
              return { updated: true, variable: v.name };
            }
          }
        }
        return { updated: false };
      })()
    `;

    await this.engine.figma.execute(code);
  }

  private async syncMutationsToFigma(mutations: DesignMutation[]): Promise<void> {
    for (const mutation of mutations) {
      if (mutation.type === "token-updated" || mutation.type === "token-created") {
        const token = this.engine.registry.designSystem.tokens.find((t) => t.name === mutation.target);
        if (token) await this.pushTokenToFigma(token);
      }
    }
  }

  // ── Self-Healing Loop ──────────────────────────────────
  // MANDATORY after every canvas creation/modification.
  // Screenshot → Analyze → Fix → Verify (max 3 rounds)

  async selfHealingLoop(nodeId: string, intent: string, maxRounds = 3): Promise<{
    healed: boolean;
    rounds: number;
    issues: string[];
  }> {
    const allIssues: string[] = [];

    for (let round = 1; round <= maxRounds; round++) {
      log.info({ nodeId, round, intent }, "Self-healing: taking screenshot");

      // Take screenshot via Figma bridge
      const screenshotCode = `
        (async () => {
          const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
          if (!node) return { error: 'Node not found' };

          // Check for common issues
          const issues = [];

          function checkNode(n, path) {
            // Issue: floating outside any frame
            if (n.parent && n.parent.type === 'PAGE' && n.type !== 'SECTION' && n.type !== 'FRAME') {
              issues.push('floating-element: ' + n.name + ' is not inside a Section or Frame');
            }

            // Issue: no auto layout on containers with children
            if (('children' in n) && n.children && n.children.length > 1) {
              if (!n.layoutMode || n.layoutMode === 'NONE') {
                issues.push('no-auto-layout: ' + n.name + ' has children but no Auto Layout');
              }
            }

            // Issue: hug contents when should fill
            if (n.layoutSizingHorizontal === 'HUG' && n.parent && n.parent.layoutMode) {
              const siblings = n.parent.children;
              if (siblings.length === 1) {
                issues.push('should-fill: ' + n.name + ' is using HUG but is the only child (should FILL)');
              }
            }

            // Issue: raw hex fills (not bound to variables)
            if (n.fills && Array.isArray(n.fills)) {
              for (const fill of n.fills) {
                if (fill.type === 'SOLID' && !fill.boundVariables?.color) {
                  issues.push('raw-color: ' + n.name + ' has unbound solid fill');
                }
              }
            }

            // Recurse children
            if ('children' in n && n.children) {
              for (const child of n.children) {
                checkNode(child, path + '/' + child.name);
              }
            }
          }

          checkNode(node, node.name);
          return { issues, nodeCount: 1, name: node.name };
        })()
      `;

      try {
        const result = await this.engine.figma.execute(screenshotCode);
        const data = typeof result === "string" ? JSON.parse(result) : result;

        if (data.error) {
          allIssues.push(`Round ${round}: ${data.error}`);
          break;
        }

        const issues = data.issues || [];
        if (issues.length === 0) {
          log.info({ nodeId, round }, "Self-healing: no issues found — design is clean");
          return { healed: true, rounds: round, issues: allIssues };
        }

        allIssues.push(...issues.map((i: string) => `Round ${round}: ${i}`));
        log.warn({ nodeId, round, issueCount: issues.length }, "Self-healing: issues found, attempting fixes");

        // Attempt automatic fixes
        const fixCode = `
          (async () => {
            const node = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
            if (!node) return { fixed: 0 };
            let fixed = 0;

            function fixNode(n) {
              // Fix: add Auto Layout to containers without it
              if (('children' in n) && n.children && n.children.length > 1) {
                if (n.type === 'FRAME' && (!n.layoutMode || n.layoutMode === 'NONE')) {
                  n.layoutMode = 'VERTICAL';
                  n.itemSpacing = 8;
                  n.paddingLeft = n.paddingRight = n.paddingTop = n.paddingBottom = 16;
                  fixed++;
                }
              }

              // Fix: change HUG to FILL for lone children
              if (n.layoutSizingHorizontal === 'HUG' && n.parent && n.parent.layoutMode) {
                const siblings = n.parent.children;
                if (siblings.length === 1) {
                  n.layoutSizingHorizontal = 'FILL';
                  fixed++;
                }
              }

              // Recurse
              if ('children' in n && n.children) {
                for (const child of n.children) {
                  fixNode(child);
                }
              }
            }

            fixNode(node);
            return { fixed };
          })()
        `;

        await this.engine.figma.execute(fixCode);
      } catch (err) {
        allIssues.push(`Round ${round}: execution error — ${err instanceof Error ? err.message : String(err)}`);
        break;
      }
    }

    return { healed: allIssues.length === 0, rounds: maxRounds, issues: allIssues };
  }

  // ── Agent Box Widget ──────────────────────────────────
  // Creates/updates a visible status box in Figma for agent transparency

  async createAgentBox(update: AgentBoxUpdate): Promise<string | null> {
    const statusColors = {
      idle:  "{ r: 0.1, g: 0.1, b: 0.18 }",
      busy:  "{ r: 0.96, g: 0.62, b: 0.04 }",
      error: "{ r: 0.94, g: 0.27, b: 0.27 }",
      done:  "{ r: 0.06, g: 0.73, b: 0.51 }",
    };
    const backgroundColors = {
      idle: "{ r: 0.06, g: 0.06, b: 0.12 }",
      busy: "{ r: 0.21, g: 0.14, b: 0.04 }",
      error: "{ r: 0.18, g: 0.05, b: 0.06 }",
      done: "{ r: 0.04, g: 0.2, b: 0.15 }",
    };
    const boxKey = getAgentBoxKey(update);
    const lines = formatAgentBoxLines(update);
    const boxName = formatAgentBoxName(update);

    const code = `
      (async () => {
        const runId = ${JSON.stringify(update.runId)};
        const taskId = ${JSON.stringify(update.taskId)};
        const role = ${JSON.stringify(update.role)};
        const task = ${JSON.stringify(update.title)};
        const status = ${JSON.stringify(update.status)};
        const taskIndex = ${update.taskIndex};
        const boxKey = ${JSON.stringify(boxKey)};
        const borderColor = ${statusColors[update.status]};
        const backgroundColor = ${backgroundColors[update.status]};
        const boxName = ${JSON.stringify(boxName)};
        const titleTextValue = ${JSON.stringify(lines.title)};
        const metaTextValue = ${JSON.stringify(lines.meta)};
        const detailTextValue = ${JSON.stringify(lines.detail)};

        // Find or create "Active Agents" section
        let section = figma.currentPage.findOne(
          n => n.type === 'SECTION' && n.name === 'Active Agents'
        );
        if (!section) {
          section = figma.createSection();
          section.name = 'Active Agents';
          section.x = -400;
          section.y = 0;
        }

        let runFrame = section.findOne(
          n => n.type === 'FRAME' && n.getPluginData && n.getPluginData('memoire-run-id') === runId
        );
        if (!runFrame || runFrame.type !== 'FRAME') {
          runFrame = figma.createFrame();
          runFrame.name = 'Run ' + runId;
          runFrame.setPluginData('memoire-run-id', runId);
          runFrame.layoutMode = 'VERTICAL';
          runFrame.primaryAxisSizingMode = 'AUTO';
          runFrame.counterAxisSizingMode = 'FIXED';
          runFrame.resize(320, 1);
          runFrame.paddingLeft = runFrame.paddingRight = 12;
          runFrame.paddingTop = runFrame.paddingBottom = 12;
          runFrame.itemSpacing = 8;
          runFrame.cornerRadius = 10;
          runFrame.fills = [{ type: 'SOLID', color: { r: 0.96, g: 0.95, b: 0.92 }, opacity: 0.55 }];
          runFrame.strokes = [{ type: 'SOLID', color: { r: 0.78, g: 0.74, b: 0.69 }, opacity: 0.35 }];
          runFrame.x = 24;
          runFrame.y = 24 + section.findAll(n => n.type === 'FRAME').length * 220;
          section.appendChild(runFrame);
        }

        // Find existing box for this run/task identity or create new one
        let box = runFrame.findOne(
          n => n.type === 'FRAME' && n.getPluginData && n.getPluginData('memoire-box-key') === boxKey
        );

        if (!box || box.type !== 'FRAME') {
          box = figma.createFrame();
          box.setPluginData('memoire-box-key', boxKey);
          box.setPluginData('memoire-task-id', taskId);
          box.setPluginData('memoire-task-index', String(taskIndex));
          runFrame.appendChild(box);
        }

        box.name = boxName;
        box.layoutMode = 'VERTICAL';
        box.primaryAxisSizingMode = 'AUTO';
        box.counterAxisSizingMode = 'FIXED';
        box.resize(296, 1);
        box.paddingLeft = box.paddingRight = 12;
        box.paddingTop = box.paddingBottom = 10;
        box.itemSpacing = 4;
        box.cornerRadius = 8;
        box.fills = [{ type: 'SOLID', color: backgroundColor, opacity: status === 'done' ? 0.72 : 0.95 }];
        box.strokes = [{ type: 'SOLID', color: borderColor }];
        box.strokeWeight = 1.5;

        // Find or create status text
        await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        const ensureText = (name) => {
          let textNode = box.findOne(n => n.name === name);
          if (!textNode || textNode.type !== 'TEXT') {
            textNode = figma.createText();
            textNode.name = name;
            box.appendChild(textNode);
          }
          return textNode;
        };

        const titleText = ensureText('agent-title');
        titleText.fontName = { family: 'Inter', style: 'Medium' };
        titleText.fontSize = 11;
        titleText.fills = [{ type: 'SOLID', color: { r: 0.94, g: 0.94, b: 0.94 } }];
        titleText.characters = titleTextValue;

        const metaText = ensureText('agent-meta');
        metaText.fontName = { family: 'Inter', style: 'Medium' };
        metaText.fontSize = 10;
        metaText.fills = [{ type: 'SOLID', color: { r: 0.72, g: 0.72, b: 0.76 } }];
        metaText.characters = metaTextValue;

        const detailText = ensureText('agent-detail');
        detailText.fontName = { family: 'Inter', style: 'Medium' };
        detailText.fontSize = 10;
        detailText.fills = [{ type: 'SOLID', color: { r: 0.82, g: 0.82, b: 0.86 } }];
        detailText.characters = detailTextValue;

        if (status === 'done') {
          detailText.opacity = 0.72;
        }

        return { boxId: box.id, status };
      })()
    `;

    try {
      const result = await this.engine.figma.execute(code);
      const data = typeof result === "string" ? JSON.parse(result) : result;
      return data?.boxId || null;
    } catch (err) {
      log.warn({ err, update }, "Failed to create agent box widget");
      return null;
    }
  }

  async updateAgentBox(update: AgentBoxUpdate): Promise<void> {
    this.publishAgentStatus(update);
    if (!this.engine.figma.isConnected) {
      return;
    }
    try {
      await this.createAgentBox(update);
    } catch (err) {
      log.warn({ err, update: update.taskId }, "Failed to update agent box on canvas");
    }
  }

  private makeAgentBoxUpdate(
    plan: AgentPlan,
    task: SubTask,
    taskIndex: number,
    status: AgentBoxVisualStatus,
    result?: unknown,
  ): AgentBoxUpdate {
    const startedAt = task.startedAt ? new Date(task.startedAt).getTime() : Date.now();
    const completedAt = task.completedAt ? new Date(task.completedAt).getTime() : Date.now();
    const elapsedMs = Math.max(0, (status === "busy" ? Date.now() : completedAt) - startedAt);
    const healRound = typeof result === "object" && result && "rounds" in (result as Record<string, unknown>)
      ? Number((result as Record<string, unknown>).rounds)
      : undefined;

    return {
      runId: plan.id,
      taskId: task.id,
      role: task.agentType,
      title: task.name,
      status,
      taskIndex,
      totalTasks: plan.subTasks.length,
      dependencyCount: task.dependencies.length,
      summary: this.summarizeTaskResult(result),
      error: status === "error" ? task.error : undefined,
      healRound,
      elapsedMs,
    };
  }

  private summarizeTaskResult(result: unknown): string | undefined {
    if (!result || typeof result !== "object") {
      return undefined;
    }
    const record = result as Record<string, unknown>;
    if (typeof record.action === "string") {
      return record.action;
    }
    if (Array.isArray(record.generated) && record.generated.length > 0) {
      return `${record.generated.length} file(s) generated`;
    }
    if (typeof record.issueCount === "number") {
      return `${record.issueCount} issue(s) checked`;
    }
    if (typeof record.tokens === "number") {
      return `${record.tokens} token(s) synced`;
    }
    if (Array.isArray(record.targetSpecs) && record.targetSpecs.length > 0) {
      return record.targetSpecs.join(", ");
    }
    if (typeof record.status === "string") {
      return record.status;
    }
    return undefined;
  }

  private publishAgentStatus(update: AgentBoxUpdate): void {
    this.engine.figma.publishAgentStatus(this.toAgentStatus(update));
  }

  private toAgentStatus(update: AgentBoxUpdate): AgentBoxState {
    return {
      runId: update.runId,
      taskId: update.taskId,
      role: update.role,
      title: update.title,
      status: update.status,
      summary: update.summary,
      error: update.error,
      healRound: update.healRound,
      elapsedMs: update.elapsedMs,
    };
  }
}
