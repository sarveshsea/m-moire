import {
  MemiCapabilityDeniedError,
  type MemiCapability,
  type MemiExecutionPolicy,
} from "./execution-policy.js";
import { join, resolve } from "node:path";

export interface CommandInvocation {
  commandPath: readonly string[];
  options: Readonly<Record<string, unknown>>;
  args: readonly unknown[];
}

export interface CommandPreflightResult {
  optionOverrides: Readonly<Record<string, unknown>>;
}

type CapabilityRequirement = readonly [capability: MemiCapability, operation: string];

const READ_ONLY_COMMAND_PATHS: readonly string[] = Object.freeze([
  "status",
  "agent.brief",
  "audit",
  "diff",
]);

// These registered legacy actions are intentionally unavailable until their
// option-dependent effects have been audited. Unknown future paths still fail closed.
const UNAVAILABLE_COMMAND_PATHS: ReadonlySet<string> = new Set([
  "add",
  "agent.kill",
  "agent.list",
  "agent.status",
  "benchmark.codex-run",
  "benchmark.fitness",
  "benchmark.fitness-backtest",
  "benchmark.fitness-record",
  "benchmark.plan",
  "benchmark.prospective-evaluate",
  "benchmark.prospective-freeze",
  "benchmark.prospective-preflight",
  "benchmark.record",
  "benchmark.regrade",
  "benchmark.report",
  "benchmark.retention",
  "benchmark.workflow-plan",
  "benchmark.workflow-run",
  "daemon.start",
  "daemon.status",
  "daemon.stop",
  "dashboard",
  "design-doc",
  "fix.apply",
  "fix.plan",
  "go",
  "heartbeat",
  "ia.create",
  "ia.extract",
  "ia.list",
  "ia.show",
  "ia.validate",
  "init",
  "ios.brief",
  "ios.scaffold",
  "list",
  "mermaid-jam.analyze",
  "mermaid-jam.corpus.status",
  "mermaid-jam.corpus.sync",
  "mermaid-jam.export",
  "mermaid-jam.open",
  "mermaid-jam.status",
  "notes.doctor",
  "notes.info",
  "notes.list",
  "notes.outdated",
  "notes.route",
  "notes.search",
  "prototype",
  "registry.doctor",
  "registry.info",
  "registry.install",
  "registry.list",
  "registry.search",
  "scaffold.component",
  "scaffold.page",
  "shadcn.doctor",
  "shadcn.export",
  "shadcn.serve",
  "simulate.compare",
  "simulate.costs",
  "simulate.export-spec",
  "simulate.generate-agents",
  "simulate.interview",
  "simulate.models",
  "simulate.plan",
  "simulate.report",
  "simulate.run",
  "simulate.run-matrix",
  "simulate.status",
  "simulate.stream",
  "simulate.transcript",
  "spec.component",
  "spec.dataviz",
  "spec.design",
  "spec.list",
  "spec.page",
  "studio.automations.list",
  "studio.automations.run",
  "studio.automations.run-due",
  "studio.automations.scheduler.install",
  "studio.automations.scheduler.status",
  "studio.automations.scheduler.uninstall",
  "studio.logs",
  "studio.tui",
  "studio.visual-parity",
  "suite.doctor",
  "suite.init",
  "suite.run",
  "theme.apply",
  "theme.diff",
  "theme.import",
  "theme.preview",
  "theme.publish",
  "theme.validate",
  "theme.variants",
  "trace.export",
  "trace.inspect",
  "trace.list",
  "validate",
  "video.create",
  "video.preview",
  "video.render",
  "video.status",
  "watch",
]);

export async function preflightCommand(
  policy: MemiExecutionPolicy,
  invocation: CommandInvocation,
): Promise<CommandPreflightResult> {
  const path = invocation.commandPath.join(".");
  const overrides: Record<string, unknown> = {};
  const require = (...requirements: CapabilityRequirement[]) => {
    assertRequirements(policy, requirements, false);
  };
  const requireLocalWrite = (...requirements: CapabilityRequirement[]) => {
    assertRequirements(policy, requirements, true);
  };

  if (READ_ONLY_COMMAND_PATHS.includes(path)) {
    return { optionOverrides: Object.freeze({}) };
  }

  if (UNAVAILABLE_COMMAND_PATHS.has(path)) {
    throw new MemiCapabilityDeniedError({
      profile: policy.profile,
      capability: "command-mapping",
      operation: `execute unavailable command "${path}". This legacy workflow needs a separate capability audit; use agent brief or diagnose --no-write for supported inspection. No direct replacement for this workflow is certified`,
    });
  }

  switch (path) {
    case "ux.audit":
    case "craft.audit":
    case "diagnose":
      if (isRemoteUrl(invocation.args[0])) {
        require(["network", "fetch the diagnosis URL"]);
      }
      if (invocation.options.changed && !(Array.isArray(invocation.options.files) && invocation.options.files.length > 0)) {
        require(["shell", "resolve changed files with git"]);
      }
      // Diagnose still writes its reports and history beneath the legacy
      // `.memoire/` tree. Local mode only permits `.memi/`, so keep diagnose
      // read-only until those report paths are migrated behind the broker.
      if (path === "diagnose" && invocation.options.receiptOnly) {
        overrides.write = false;
      } else if (policy.profile === "locked" || policy.profile === "local") {
        if (invocation.options.write !== false || path === "diagnose") overrides.write = false;
      } else if (invocation.options.write !== false) {
        requireLocalWrite(
          ["project-write", "write diagnosis reports"],
          ["source-content-persistence", "persist diagnosis source evidence"],
        );
      }
      break;
    case "tokens":
      if (isRemoteUrl(invocation.options.from)) require(["network", "extract tokens from a URL"]);
      if (!invocation.options.json || invocation.options.save || invocation.options.report) {
        require(
          ["source-content-persistence", "persist token source evidence"],
          ["project-write", "write token artifacts"],
        );
      }
      break;
    case "generate":
      if (invocation.options.critique) require(["network", "request an AI layout critique"]);
      if (!invocation.options.preview) {
        require(
          ["source-content-persistence", "persist generated source code"],
          ["project-write", "write generated code"],
        );
      }
      break;
    case "baseline.status":
      if (isRemoteUrl(invocation.args[0])) require(["network", "scan baseline target URL"]);
      break;
    case "baseline.accept":
    case "report":
      if (isRemoteUrl(invocation.args[0])) require(["network", "scan report target URL"]);
      require(["source-content-persistence", "persist report source evidence"], ["project-write", "write report artifacts"]);
      break;
    case "doctor":
      if (invocation.options.repairPlugin) {
        require(["home-write", "repair the Figma plugin"]);
      }
      break;
    case "self-update":
      require(["network", "check npm for updates"]);
      if (!invocation.options.check && !invocation.options.silent) {
        require(
          ["dynamic-install", "install the resolved CLI version"],
          ["shell", "run the package manager"],
          ["home-write", "replace the global CLI installation"],
        );
      }
      break;
    case "upgrade":
      require(["network", "check standalone binary releases"]);
      if (!invocation.options.check) {
        require(
          ["dynamic-install", "install the resolved standalone version"],
          ["shell", "replace the standalone executable"],
          ["home-write", "replace the standalone executable"],
        );
      }
      break;
    case "setup.plugin":
      require(["home-write", "install the packaged Figma plugin"]);
      break;
    case "setup":
      require(
        ["network", "validate setup credentials"],
        ["figma", "configure the Figma bridge"],
        ["project-write", "write project configuration"],
        ["home-write", "install user configuration"],
      );
      break;
    case "connect":
      require(
        ["figma", "connect to Figma"],
        ["network", "open the Figma bridge"],
        ["project-write", "write the Figma bridge lock"],
      );
      if (invocation.options.background) {
        require(["shell", "start the bridge in the background"]);
      }
      break;
    case "compose":
      require(["network", "run model composition"]);
      if (invocation.options.figma !== false) {
        require(["figma", "run Figma composition steps"]);
      }
      require(["project-write", "persist composition results"]);
      break;
    case "view":
      if (!invocation.options.print && !invocation.options.json) {
        require(
          ["browser", "open a registry URL"],
          ["shell", "launch the system URL handler"],
        );
      }
      break;
    case "mcp":
    case "mcp.start":
      if (invocation.options.figma !== false) {
        require(["figma", "enable Figma MCP tools"], ["network", "connect Figma MCP tools"]);
      }
      break;
    case "mcp.config":
      if (invocation.options.install) {
        require([
          invocation.options.global ? "home-write" : "project-write",
          "install MCP configuration",
        ]);
      }
      break;
    case "notes.install": {
      require(["project-write", "install a Memoire Note"]);
      const source = String(invocation.args[0] ?? "");
      if (isRemoteNoteSource(source)) {
        require(["network", "download a remote Memoire Note"]);
      }
      if (source.startsWith("github:")) {
        require(["shell", "clone a GitHub Memoire Note with git"]);
      }
      break;
    }
    case "notes.update":
      require(
        ["network", "check remote Memoire Notes"],
        ["project-write", "update installed Memoire Notes"],
      );
      break;
    case "notes.create":
    case "notes.remove":
      require(["project-write", "modify installed Memoire Notes"]);
      break;
    case "agent.install":
      if (!invocation.options.dryRun) {
        require(
          ["dynamic-install", "install agent integration files"],
          [invocation.options.global ? "home-write" : "project-write", "write agent integration files"],
        );
      }
      break;
    case "agent.spawn":
      require(["shell", "spawn an agent process"]);
      if (invocation.options.remote) {
        require(["network", "connect to a remote agent host"]);
      }
      break;
    case "update":
      require(
        ["network", "download registry updates"],
        ["project-write", "update registry components"],
      );
      break;
    case "uninstall":
      require(
        ["home-write", "remove user Memi data"],
        ["project-write", "remove project Memi data"],
      );
      break;
    case "studio.status":
      require(
        ["project-write", "initialize Studio project state"],
        ["shell", "probe Studio harness availability"],
      );
      break;
    case "studio.browser.status":
      require(["project-write", "initialize Studio browser project state"]);
      break;
    case "studio.browser.open":
      require(
        ["project-write", "persist Studio browser session artifacts"],
        ["browser", "launch the Studio browser runtime"],
        ["shell", "launch the Playwright browser process"],
        ["network", "navigate the Studio browser"],
      );
      break;
    case "studio.serve":
    case "studio.web":
      require(
        ["project-write", "persist Studio runtime state"],
        ["source-content-persistence", "persist Studio prompts and session events"],
        ["network", "start the Studio localhost runtime"],
        ["shell", "enable Studio harness processes"],
        ["browser", "enable Studio browser tools"],
        ["figma", "enable Studio Figma tools"],
      );
      break;
    case "studio.run":
      require(
        ["project-write", "persist Studio harness state"],
        ["source-content-persistence", "persist Studio harness prompts and events"],
        ["shell", "spawn the selected Studio harness"],
        ["network", "connect the selected Studio harness"],
      );
      if (invocation.options.mode === "brokered") {
        require(
          ["browser", "enable brokered Studio browser tools"],
          ["figma", "enable brokered Studio Figma tools"],
        );
      }
      break;
    case "ci":
      if (isRemoteUrl(invocation.args[0])) require(["network", "scan CI target URL"]);
      if (invocation.options.scope !== false) require(["shell", "resolve CI changed files with git"]);
      require(
        ["project-write", "write design CI artifacts"],
        ["source-content-persistence", "persist design CI source evidence"],
      );
      break;
    case "preview":
      require(["project-write", "write generated preview pages"]);
      if (!invocation.options.buildOnly) {
        require(
          ["network", "start the localhost preview server"],
          ["shell", "start a fallback preview server"],
          ["dynamic-install", "install the pinned fallback preview server"],
        );
      }
      break;
    case "publish":
      require(["project-write", "write the registry package"]);
      await policy.assertProjectWrite(
        resolvePublishOutput(policy.projectRoot, invocation.options),
        "write the registry package",
      );
      if (invocation.options.figma) {
        require(["network", "pull Figma data for publication"]);
      }
      if (isRemoteUrl(invocation.options.theme)) {
        require(["network", "download the publication theme"]);
      }
      if (invocation.options.push) {
        require(
          ["network", "publish the registry package"],
          ["shell", "run npm publish"],
        );
      }
      break;
    case "research.from-file":
    case "research.from-transcript":
      require(
        ["project-write", "write research artifacts"],
        ["source-content-persistence", "persist imported research source content"],
      );
      break;
    case "research.from-stickies":
      require(
        ["project-write", "write research artifacts"],
        ["source-content-persistence", "persist imported FigJam content"],
        ["figma", "read FigJam stickies"],
        ["network", "connect to the Figma bridge"],
      );
      break;
    case "research.web":
      if (hasResearchUrls(invocation.options)) {
        require(
          ["project-write", "write research artifacts"],
          ["network", "fetch research URLs"],
          ["source-content-persistence", "persist fetched research content"],
        );
      }
      break;
    case "research.synthesize":
    case "research.report":
    case "research.quality":
    case "research.trace":
    case "research.coverage":
      require(["project-write", "initialize and update the research store"]);
      break;
    case "research.design":
      require(["project-write", "write research design artifacts"]);
      if (invocation.options.open) {
        require(
          ["browser", "open the Mermaid Jam target"],
          ["shell", "launch the system URL handler"],
          ["network", "open the Mermaid Jam target"],
        );
      }
      break;
    case "pull":
      require(
        ["project-write", "persist the pulled design system and generated specs"],
        ["network", invocation.options.penpot ? "pull from Penpot" : "pull from Figma"],
      );
      if (!invocation.options.penpot && !invocation.options.rest) {
        require(["figma", "pull Figma design data"]);
      }
      break;
    case "sync":
      require(
        ["project-write", "persist synchronized design data and generated code"],
        ["figma", "synchronize with Figma"],
        ["network", "connect to the Figma bridge"],
      );
      if (invocation.options.autoPr) {
        require(["shell", "create and publish the synchronization pull request"]);
      }
      break;
    case "export":
      require([
        "project-write",
        invocation.options.dryRun
          ? "initialize project state for the export dry run"
          : "export generated code into the project source tree",
      ]);
      if (!invocation.options.dryRun && typeof invocation.options.target === "string") {
        await policy.assertProjectWrite(
          join(policy.projectRoot, invocation.options.target),
          "export generated code into the project source tree",
        );
      }
      break;
    default:
      throw unmappedCommandDenial(policy, path);
  }

  return { optionOverrides: Object.freeze({ ...overrides }) };
}

function hasResearchUrls(options: Readonly<Record<string, unknown>>): boolean {
  if (options.planOnly === true || typeof options.urls !== "string") {
    return false;
  }
  return options.urls.split(",").some((url) => url.trim().length > 0);
}

function assertRequirements(
  policy: MemiExecutionPolicy,
  requirements: readonly CapabilityRequirement[],
  allowLocalProjectWrite: boolean,
): void {
  for (const [capability, operation] of requirements) {
    if (capability === "project-write" && policy.profile === "local" && !allowLocalProjectWrite) {
      throw new MemiCapabilityDeniedError({
        profile: policy.profile,
        capability,
        operation,
      });
    }
    policy.assert(capability, operation);
  }
}

function unmappedCommandDenial(policy: MemiExecutionPolicy, path: string): MemiCapabilityDeniedError {
  return new MemiCapabilityDeniedError({
    profile: policy.profile,
    capability: "command-mapping",
    operation: `execute unmapped command "${path || "<root>"}"`,
  });
}

function resolvePublishOutput(
  projectRoot: string,
  options: Readonly<Record<string, unknown>>,
): string {
  if (typeof options.dir === "string" && options.dir.trim()) {
    return resolve(options.dir);
  }
  const baseName = String(options.name ?? "").replace(/^@[^/]+\//, "");
  return resolve(projectRoot, baseName);
}

function isRemoteNoteSource(source: string): boolean {
  return /^(?:github:|https?:\/\/|git\+|ssh:|git@)/i.test(source);
}

function isRemoteUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
