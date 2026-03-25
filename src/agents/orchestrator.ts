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
import { AGENT_PROMPTS } from "./prompts.js";

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
  | "motion-animation"
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
  | "responsive-specialist"
  | "motion-designer";

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

  // Motion & animation
  [/\b(motion|animat|transition|easing|stagger|reveal|fade|slide|scale|parallax|keyframe)\b/i, "motion-animation"],

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

    const context = await this.buildContext();
    const plan = this.buildPlan(intent, category, context);

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

  buildPlan(intent: string, category: IntentCategory, context: AgentContext): AgentPlan {
    const planId = `plan-${++this.planCounter}-${Date.now()}`;

    const subTasks = this.decompose(intent, category, context);

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
      case "motion-animation":
        return this.decomposeMotionAnimation(intent, ctx);
      case "design-system-init":
        return this.decomposeDesignSystemInit(intent, ctx);
      default:
        return this.decomposeGeneral(intent, ctx);
    }
  }

  private makeTask(name: string, agentType: SubAgentType, prompt: string, deps: string[] = []): SubTask {
    const id = `task-${++this.taskCounter}`;
    return { id, name, agentType, prompt, dependencies: deps, status: "pending" };
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
    const t1 = this.makeTask(
      "Analyze component requirements",
      "component-architect",
      AGENT_PROMPTS.componentAnalysis(intent, ctx.designSystem, ctx.specs),
    );
    const t2 = this.makeTask(
      "Design component spec",
      "component-architect",
      AGENT_PROMPTS.componentDesign(intent, ctx.designSystem),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Generate component code",
      "code-generator",
      AGENT_PROMPTS.componentCodegen(intent),
      [t2.id],
    );
    const tasks = [t1, t2, t3];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Create component in Figma", "figma-executor", AGENT_PROMPTS.figmaComponentCreate(intent), [t3.id]));
    }

    return tasks;
  }

  // ── Component Modify Decomposition ─────────────────────

  private decomposeComponentModify(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Identify target component",
      "component-architect",
      AGENT_PROMPTS.componentIdentify(intent, ctx.specs),
    );
    const t2 = this.makeTask(
      "Update component spec",
      "component-architect",
      AGENT_PROMPTS.componentModify(intent),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Regenerate component code",
      "code-generator",
      AGENT_PROMPTS.componentCodegen(intent),
      [t2.id],
    );
    return [t1, t2, t3];
  }

  // ── Page Layout Decomposition ──────────────────────────

  private decomposePageLayout(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Analyze page requirements",
      "layout-designer",
      AGENT_PROMPTS.pageAnalysis(intent, ctx.specs),
    );
    const t2 = this.makeTask(
      "Design page layout spec",
      "layout-designer",
      AGENT_PROMPTS.pageDesign(intent, ctx.designSystem, ctx.specs),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Generate page code",
      "code-generator",
      AGENT_PROMPTS.pageCodegen(intent),
      [t2.id],
    );
    const tasks = [t1, t2, t3];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Compose page in Figma", "figma-executor", AGENT_PROMPTS.figmaPageCompose(intent), [t3.id]));
    }

    return tasks;
  }

  // ── DataViz Create Decomposition ───────────────────────

  private decomposeDatavizCreate(intent: string, ctx: AgentContext): SubTask[] {
    const t1 = this.makeTask(
      "Analyze data visualization needs",
      "dataviz-specialist",
      AGENT_PROMPTS.datavizAnalysis(intent),
    );
    const t2 = this.makeTask(
      "Design chart spec",
      "dataviz-specialist",
      AGENT_PROMPTS.datavizDesign(intent, ctx.designSystem),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Generate chart code",
      "code-generator",
      AGENT_PROMPTS.datavizCodegen(intent),
      [t2.id],
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

  // ── Motion Animation Decomposition ─────────────────────

  private decomposeMotionAnimation(intent: string, ctx: AgentContext): SubTask[] {
    const componentNames = ctx.specs.filter(s => s.type === "component").map(s => s.name);
    const t1 = this.makeTask(
      "Analyze motion candidates",
      "motion-designer",
      AGENT_PROMPTS.motionAnalysis(intent, ctx.specs),
    );
    const t2 = this.makeTask(
      "Create motion tokens",
      "motion-designer",
      AGENT_PROMPTS.motionTokens(intent, ctx.designSystem),
      [t1.id],
    );
    const t3 = this.makeTask(
      "Specify component animations",
      "motion-designer",
      AGENT_PROMPTS.motionSpecify(intent, componentNames),
      [t1.id],
    );
    const t4 = this.makeTask(
      "Generate motion code",
      "code-generator",
      AGENT_PROMPTS.motionCodegen(intent),
      [t2.id, t3.id],
    );
    const tasks = [t1, t2, t3, t4];

    if (ctx.figmaConnected) {
      tasks.push(this.makeTask("Sync motion tokens to Figma", "figma-executor", AGENT_PROMPTS.figmaSync("motion-tokens", intent), [t2.id]));
    }

    return tasks;
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

    // Topological execution — respect dependencies
    while (completed.size < plan.subTasks.length) {
      const ready = plan.subTasks.filter(
        (t) => t.status === "pending" && t.dependencies.every((d) => completed.has(d)),
      );

      if (ready.length === 0 && completed.size < plan.subTasks.length) {
        // Deadlock or all remaining tasks failed
        break;
      }

      // Execute ready tasks in parallel
      await Promise.all(
        ready.map(async (task) => {
          task.status = "running";
          task.startedAt = new Date().toISOString();
          this.onUpdate?.(plan);

          try {
            const result = await this.executeSubTask(task, plan.context);
            task.status = "completed";
            task.result = result;
            task.completedAt = new Date().toISOString();
            completedTasks++;

            if (result && typeof result === "object" && "mutations" in result) {
              mutations.push(...(result as { mutations: DesignMutation[] }).mutations);
            }
          } catch (err) {
            task.status = "failed";
            task.error = (err as Error).message;
            task.completedAt = new Date().toISOString();
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
      status: completedTasks === plan.subTasks.length ? "completed" : completedTasks > 0 ? "partial" : "failed",
      completedTasks,
      totalTasks: plan.subTasks.length,
      mutations,
      figmaSynced,
    };
  }

  // ── Sub-Agent Execution ────────────────────────────────

  private async executeSubTask(task: SubTask, ctx: AgentContext): Promise<unknown> {
    log.info({ taskId: task.id, agent: task.agentType, name: task.name }, "Executing sub-task");

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
      case "motion-designer":
        return this.executeMotionDesigner(task, ctx);
      default:
        log.warn({ agentType: task.agentType }, "Unknown sub-agent type");
        return { status: "skipped" };
    }
  }

  // ── Token Engineer Sub-Agent ───────────────────────────

  private async executeTokenEngineer(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const mutations: DesignMutation[] = [];
    const ds = this.engine.registry.designSystem;

    if (task.name.includes("Analyze")) {
      // Produce an analysis report of the current token state
      const tokensByType = new Map<string, DesignToken[]>();
      for (const token of ds.tokens) {
        const group = tokensByType.get(token.type) || [];
        group.push(token);
        tokensByType.set(token.type, group);
      }

      const analysis = {
        totalTokens: ds.tokens.length,
        byType: Object.fromEntries(
          Array.from(tokensByType.entries()).map(([type, tokens]) => [
            type,
            { count: tokens.length, names: tokens.map(t => t.name) },
          ])
        ),
        missingTypes: ["color", "spacing", "typography", "radius", "shadow"].filter(
          t => !tokensByType.has(t)
        ),
      };

      log.info({ analysis }, "Token engineer: analysis complete");
      return { status: "completed", analysis };
    }

    if (task.name.includes("Apply") || task.name.includes("Update") || task.name.includes("Generate")) {
      // Execute actual token mutations via the registry
      // Parse the task prompt for token operations
      const tokenOps = this.parseTokenOperations(task.prompt, ds.tokens);
      for (const op of tokenOps) {
        if (op.action === "create") {
          this.engine.registry.addToken(op.token);
          mutations.push({
            type: "token-created",
            target: op.token.name,
            detail: `Created ${op.token.type} token: ${op.token.name}`,
            after: op.token,
          });
        } else if (op.action === "update") {
          this.engine.registry.updateToken(op.token.name, op.token);
          mutations.push({
            type: "token-updated",
            target: op.token.name,
            detail: `Updated ${op.token.type} token: ${op.token.name}`,
            after: op.token,
          });
        }
      }

      await this.engine.registry.save();
      log.info({ mutations: mutations.length }, "Token engineer: mutations applied");
    }

    if (task.name.includes("Scaffold")) {
      // Generate a foundational token set for new design systems
      const foundation = this.generateFoundationTokens();
      for (const token of foundation) {
        this.engine.registry.addToken(token);
        mutations.push({
          type: "token-created",
          target: token.name,
          detail: `Scaffolded ${token.type} token: ${token.name}`,
          after: token,
        });
      }
      await this.engine.registry.save();
      log.info({ scaffolded: foundation.length }, "Token engineer: foundation scaffolded");
    }

    return { status: "completed", mutations, tokenCount: ds.tokens.length };
  }

  private parseTokenOperations(prompt: string, existing: DesignToken[]): { action: "create" | "update"; token: DesignToken }[] {
    // Extract token intent from prompt context — returns empty if no parseable operations
    // Real mutation happens when the prompt includes structured token data
    const ops: { action: "create" | "update"; token: DesignToken }[] = [];
    // This is designed to be extended by Claude via the compose command,
    // which injects structured token data into the prompt
    return ops;
  }

  private generateFoundationTokens(): DesignToken[] {
    return [
      { name: "color/bg", type: "color", values: { default: "#111113" }, collection: "primitives", cssVariable: "--color-bg" },
      { name: "color/bg-card", type: "color", values: { default: "#19191c" }, collection: "primitives", cssVariable: "--color-bg-card" },
      { name: "color/fg", type: "color", values: { default: "#ffffff" }, collection: "primitives", cssVariable: "--color-fg" },
      { name: "color/fg-muted", type: "color", values: { default: "#636369" }, collection: "primitives", cssVariable: "--color-fg-muted" },
      { name: "color/border", type: "color", values: { default: "#2a2a2e" }, collection: "primitives", cssVariable: "--color-border" },
      { name: "color/accent", type: "color", values: { default: "#a0a0a6" }, collection: "primitives", cssVariable: "--color-accent" },
      { name: "spacing/1", type: "spacing", values: { default: "4" }, collection: "primitives", cssVariable: "--spacing-1" },
      { name: "spacing/2", type: "spacing", values: { default: "8" }, collection: "primitives", cssVariable: "--spacing-2" },
      { name: "spacing/3", type: "spacing", values: { default: "12" }, collection: "primitives", cssVariable: "--spacing-3" },
      { name: "spacing/4", type: "spacing", values: { default: "16" }, collection: "primitives", cssVariable: "--spacing-4" },
      { name: "spacing/6", type: "spacing", values: { default: "24" }, collection: "primitives", cssVariable: "--spacing-6" },
      { name: "spacing/8", type: "spacing", values: { default: "32" }, collection: "primitives", cssVariable: "--spacing-8" },
      { name: "radius/sm", type: "radius", values: { default: "2" }, collection: "primitives", cssVariable: "--radius-sm" },
      { name: "radius/md", type: "radius", values: { default: "4" }, collection: "primitives", cssVariable: "--radius-md" },
      { name: "radius/lg", type: "radius", values: { default: "8" }, collection: "primitives", cssVariable: "--radius-lg" },
    ];
  }

  // ── Component Architect Sub-Agent ──────────────────────

  private async executeComponentArchitect(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const mutations: DesignMutation[] = [];

    if (task.name.includes("Analyze") || task.name.includes("Identify")) {
      // Analyze existing specs and design system for component gaps
      const componentSpecs = ctx.specs.filter(s => s.type === "component") as ComponentSpec[];
      const atomCount = componentSpecs.filter(s => s.level === "atom").length;
      const moleculeCount = componentSpecs.filter(s => s.level === "molecule").length;
      const organismCount = componentSpecs.filter(s => s.level === "organism").length;

      return {
        status: "completed",
        analysis: {
          total: componentSpecs.length,
          atoms: atomCount,
          molecules: moleculeCount,
          organisms: organismCount,
          missingBase: this.findMissingShadcnBase(componentSpecs),
        },
      };
    }

    if (task.name.includes("Design") || task.name.includes("Create")) {
      // The prompt contains the component specification context
      // Claude will use this to create a properly typed ComponentSpec
      log.info({ task: task.name }, "Component architect: designing spec from intent");

      return {
        status: "completed",
        mutations,
        message: "Spec design context prepared — Claude compose will create the actual spec",
      };
    }

    if (task.name.includes("Update") || task.name.includes("Modify")) {
      log.info({ task: task.name }, "Component architect: updating spec");
      return { status: "completed", mutations };
    }

    return { status: "completed", specs: ctx.specs.length };
  }

  private findMissingShadcnBase(specs: ComponentSpec[]): string[] {
    const essentialAtoms = ["button", "badge", "input", "label", "card", "dialog"];
    const existing = new Set(specs.flatMap(s => s.shadcnBase.map(b => b.toLowerCase())));
    return essentialAtoms.filter(a => !existing.has(a));
  }

  // ── Layout Designer Sub-Agent ──────────────────────────

  private async executeLayoutDesigner(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const pageSpecs = ctx.specs.filter(s => s.type === "page") as PageSpec[];

    if (task.name.includes("Analyze")) {
      return {
        status: "completed",
        analysis: {
          pages: pageSpecs.length,
          layouts: pageSpecs.map(p => ({ name: p.name, layout: p.layout, sections: p.sections.length })),
          missingResponsive: pageSpecs.filter(p => !p.responsive.mobile || !p.responsive.desktop).map(p => p.name),
        },
      };
    }

    log.info({ task: task.name, pages: pageSpecs.length }, "Layout designer processing");
    return { status: "completed" };
  }

  // ── Dataviz Specialist Sub-Agent ───────────────────────

  private async executeDatavizSpecialist(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const datavizSpecs = ctx.specs.filter(s => s.type === "dataviz") as DataVizSpec[];

    if (task.name.includes("Analyze")) {
      return {
        status: "completed",
        analysis: {
          charts: datavizSpecs.length,
          types: datavizSpecs.map(d => ({ name: d.name, chartType: d.chartType })),
        },
      };
    }

    log.info({ task: task.name }, "Dataviz specialist processing");
    return { status: "completed" };
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

    for (const spec of ctx.specs) {
      try {
        const file = await this.engine.generateFromSpec(spec.name);
        generated.push(file);
      } catch (err) {
        log.warn({ spec: spec.name, err }, "Failed to generate");
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
    const mutations: DesignMutation[] = [];
    const ds = ctx.designSystem;

    if (task.name.includes("Analyze")) {
      const colorTokens = ds.tokens.filter(t => t.type === "color");
      const hasDarkMode = colorTokens.some(t => "dark" in t.values);
      const hasLightMode = colorTokens.some(t => "light" in t.values);

      return {
        status: "completed",
        analysis: {
          totalColors: colorTokens.length,
          hasDarkMode,
          hasLightMode,
          modes: hasDarkMode && hasLightMode ? ["light", "dark"] : hasDarkMode ? ["dark"] : hasLightMode ? ["light"] : ["default"],
          tokensByCollection: this.groupTokensByCollection(ds.tokens),
        },
      };
    }

    if (task.name.includes("Generate") || task.name.includes("Create")) {
      // Generate theme token set with light/dark modes
      const themeTokens: DesignToken[] = [
        { name: "theme/bg", type: "color", values: { light: "#ffffff", dark: "#111113" }, collection: "theme", cssVariable: "--theme-bg" },
        { name: "theme/bg-subtle", type: "color", values: { light: "#f8f8f8", dark: "#19191c" }, collection: "theme", cssVariable: "--theme-bg-subtle" },
        { name: "theme/fg", type: "color", values: { light: "#111113", dark: "#ffffff" }, collection: "theme", cssVariable: "--theme-fg" },
        { name: "theme/fg-muted", type: "color", values: { light: "#636369", dark: "#a0a0a6" }, collection: "theme", cssVariable: "--theme-fg-muted" },
        { name: "theme/border", type: "color", values: { light: "#e4e4e7", dark: "#2a2a2e" }, collection: "theme", cssVariable: "--theme-border" },
        { name: "theme/accent", type: "color", values: { light: "#18181b", dark: "#fafafa" }, collection: "theme", cssVariable: "--theme-accent" },
      ];

      for (const token of themeTokens) {
        this.engine.registry.addToken(token);
        mutations.push({ type: "token-created", target: token.name, detail: `Theme token: ${JSON.stringify(token.values)}` });
      }
      await this.engine.registry.save();

      return { status: "completed", mutations, tokensCreated: themeTokens.length };
    }

    return { status: "completed" };
  }

  private groupTokensByCollection(tokens: DesignToken[]): Record<string, number> {
    const groups: Record<string, number> = {};
    for (const t of tokens) {
      groups[t.collection] = (groups[t.collection] || 0) + 1;
    }
    return groups;
  }

  // ── Responsive Specialist Sub-Agent ────────────────────

  private async executeResponsiveSpecialist(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const pageSpecs = ctx.specs.filter((s) => s.type === "page") as PageSpec[];
    const issues: string[] = [];

    for (const page of pageSpecs) {
      if (!page.responsive.mobile) issues.push(`Page "${page.name}" missing mobile layout`);
      if (!page.responsive.tablet) issues.push(`Page "${page.name}" missing tablet layout`);
      if (!page.responsive.desktop) issues.push(`Page "${page.name}" missing desktop layout`);
    }

    return { status: "completed", issues, pageCount: pageSpecs.length };
  }

  // ── Motion Designer Sub-Agent ──────────────────────────

  private async executeMotionDesigner(task: SubTask, ctx: AgentContext): Promise<unknown> {
    const mutations: DesignMutation[] = [];

    if (task.name.includes("Analyze")) {
      // Classify motion candidates from existing specs
      const components = ctx.specs.filter(s => s.type === "component") as ComponentSpec[];
      const pages = ctx.specs.filter(s => s.type === "page") as PageSpec[];

      const candidates: { name: string; category: string; trigger: string; duration: string }[] = [];

      for (const comp of components) {
        // Interactive components get micro-interactions
        if (comp.props.onClick || comp.props.onPress || comp.props.variant) {
          candidates.push({ name: comp.name, category: "micro-interaction", trigger: "hover/click", duration: "100-350ms" });
        }
        // Cards and content blocks get entrance animations
        if (comp.level === "organism" || comp.level === "molecule") {
          candidates.push({ name: comp.name, category: "macro-transition", trigger: "intersection/load", duration: "300-500ms" });
        }
      }

      for (const page of pages) {
        candidates.push({ name: page.name, category: "hero-animation", trigger: "load", duration: "800-1200ms" });
      }

      return { status: "completed", candidates, totalCandidates: candidates.length };
    }

    if (task.name.includes("token") || task.name.includes("Token")) {
      // Create motion design tokens
      const motionTokens: DesignToken[] = [
        { name: "motion/instant", type: "other", values: { default: "100ms" }, collection: "motion", cssVariable: "--motion-instant" },
        { name: "motion/fast", type: "other", values: { default: "160ms" }, collection: "motion", cssVariable: "--motion-fast" },
        { name: "motion/normal", type: "other", values: { default: "240ms" }, collection: "motion", cssVariable: "--motion-normal" },
        { name: "motion/slow", type: "other", values: { default: "400ms" }, collection: "motion", cssVariable: "--motion-slow" },
        { name: "motion/slower", type: "other", values: { default: "600ms" }, collection: "motion", cssVariable: "--motion-slower" },
        { name: "motion/cinematic", type: "other", values: { default: "1000ms" }, collection: "motion", cssVariable: "--motion-cinematic" },
        { name: "ease/default", type: "other", values: { default: "cubic-bezier(0.25, 0.1, 0.25, 1)" }, collection: "motion", cssVariable: "--ease-default" },
        { name: "ease/in", type: "other", values: { default: "cubic-bezier(0.55, 0.055, 0.675, 0.19)" }, collection: "motion", cssVariable: "--ease-in" },
        { name: "ease/out", type: "other", values: { default: "cubic-bezier(0.215, 0.61, 0.355, 1)" }, collection: "motion", cssVariable: "--ease-out" },
        { name: "ease/in-out", type: "other", values: { default: "cubic-bezier(0.645, 0.045, 0.355, 1)" }, collection: "motion", cssVariable: "--ease-in-out" },
        { name: "ease/spring", type: "other", values: { default: "cubic-bezier(0.34, 1.56, 0.64, 1)" }, collection: "motion", cssVariable: "--ease-spring" },
        { name: "stagger/fast", type: "other", values: { default: "30ms" }, collection: "motion", cssVariable: "--stagger-fast" },
        { name: "stagger/normal", type: "other", values: { default: "50ms" }, collection: "motion", cssVariable: "--stagger-normal" },
        { name: "stagger/slow", type: "other", values: { default: "80ms" }, collection: "motion", cssVariable: "--stagger-slow" },
      ];

      for (const token of motionTokens) {
        this.engine.registry.addToken(token);
        mutations.push({ type: "token-created", target: token.name, detail: `Motion token: ${Object.values(token.values)[0]}` });
      }
      await this.engine.registry.save();

      return { status: "completed", mutations, tokensCreated: motionTokens.length };
    }

    if (task.name.includes("Specify") || task.name.includes("spec")) {
      // Generate motion specifications for components
      const components = ctx.specs.filter(s => s.type === "component") as ComponentSpec[];
      const motionSpecs = components.map(comp => ({
        component: comp.name,
        level: comp.level,
        states: {
          idle: { opacity: 1, transform: "none" },
          enter: {
            from: { opacity: 0, transform: comp.level === "organism" ? "translateY(20px)" : "translateY(8px)" },
            to: { opacity: 1, transform: "none" },
            duration: comp.level === "atom" ? "var(--motion-fast)" : "var(--motion-normal)",
            easing: "var(--ease-out)",
          },
          hover: comp.level === "atom" ? {
            transform: "translateY(-1px)",
            duration: "var(--motion-fast)",
            easing: "var(--ease-spring)",
          } : null,
        },
        reducedMotion: "instant state change, no animation",
      }));

      return { status: "completed", motionSpecs, count: motionSpecs.length };
    }

    return { status: "completed" };
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
        allIssues.push(`Round ${round}: execution error — ${(err as Error).message}`);
        break;
      }
    }

    return { healed: allIssues.length === 0, rounds: maxRounds, issues: allIssues };
  }

  // ── Agent Box Widget ──────────────────────────────────
  // Creates/updates a visible status box in Figma for agent transparency

  async createAgentBox(role: string, task: string, status: "idle" | "busy" | "error" | "done"): Promise<string | null> {
    const statusColors = {
      idle:  "{ r: 0.1, g: 0.1, b: 0.18 }",
      busy:  "{ r: 0.96, g: 0.62, b: 0.04 }",
      error: "{ r: 0.94, g: 0.27, b: 0.27 }",
      done:  "{ r: 0.06, g: 0.73, b: 0.51 }",
    };

    const code = `
      (async () => {
        const role = ${JSON.stringify(role)};
        const task = ${JSON.stringify(task)};
        const status = ${JSON.stringify(status)};
        const borderColor = ${statusColors[status]};

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

        // Find existing box for this role or create new one
        let box = section.findOne(n => n.name.includes('[' + role + ']'));

        if (!box || box.type !== 'FRAME') {
          box = figma.createFrame();
          section.appendChild(box);
        }

        box.name = status === 'done' ? '✓ [' + role + '] Complete' : '[' + role + '] ' + task;
        box.layoutMode = 'VERTICAL';
        box.primaryAxisSizingMode = 'AUTO';
        box.counterAxisSizingMode = 'FIXED';
        box.resize(280, 1);
        box.paddingLeft = box.paddingRight = 12;
        box.paddingTop = box.paddingBottom = 10;
        box.itemSpacing = 4;
        box.cornerRadius = 8;
        box.fills = [{ type: 'SOLID', color: { r: 0.06, g: 0.06, b: 0.12 }, opacity: 0.95 }];
        box.strokes = [{ type: 'SOLID', color: borderColor }];
        box.strokeWeight = 1.5;

        // Find or create status text
        await figma.loadFontAsync({ family: "Inter", style: "Medium" });
        let statusText = box.findOne(n => n.name === 'agent-status');
        if (!statusText || statusText.type !== 'TEXT') {
          statusText = figma.createText();
          statusText.name = 'agent-status';
          box.appendChild(statusText);
        }
        statusText.fontName = { family: 'Inter', style: 'Medium' };
        statusText.fontSize = 11;
        statusText.fills = [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 } }];
        statusText.characters = role.toUpperCase() + ' — ' + status + '\\n' + task;

        // Collapse when done
        if (status === 'done') {
          box.resize(280, 28);
          box.fills = [{ type: 'SOLID', color: { r: 0.04, g: 0.45, b: 0.34 }, opacity: 0.3 }];
          statusText.characters = '✓ ' + role + ': complete';
        }

        return { boxId: box.id, status };
      })()
    `;

    try {
      const result = await this.engine.figma.execute(code);
      const data = typeof result === "string" ? JSON.parse(result) : result;
      return data?.boxId || null;
    } catch (err) {
      log.warn({ err, role }, "Failed to create agent box widget");
      return null;
    }
  }

  async updateAgentBox(role: string, task: string, status: "idle" | "busy" | "error" | "done"): Promise<void> {
    await this.createAgentBox(role, task, status);
  }
}
