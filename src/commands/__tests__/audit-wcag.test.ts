/**
 * Tests for `memi audit --wcag`
 * WA-306 — 20+ tests covering all check types, exit codes, JSON shape, and filters.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { registerAuditCommand } from "../audit.js";
import { captureLogs } from "./test-helpers.js";

// ── Helpers ──────────────────────────────────────────────────────

type Accessibility = {
  role?: string;
  ariaLabel?: "required" | "optional" | "none";
  keyboardNav?: boolean;
  touchTarget?: string;
  focusStyle?: "outline" | "ring" | "custom" | "none";
  colorContrast?: {
    foreground?: string;
    background?: string;
    minimumLevel?: "AA" | "AAA";
    assertedRatio?: number;
  };
};

type FakeSpec = {
  type: "component" | "page";
  name: string;
  purpose?: string;
  shadcnBase?: string[];
  accessibility?: Accessibility;
};

function makeEngine(specs: FakeSpec[]) {
  return {
    async init() {},
    registry: {
      async load() {},
      async getAllSpecs() {
        return specs;
      },
      getGenerationState() { return null; },
    },
  };
}

/** Parse the last console.log output as JSON */
function lastJson(logs: string[]): Record<string, unknown> {
  const last = logs.at(-1);
  if (!last) throw new Error("No console.log output captured");
  return JSON.parse(last) as Record<string, unknown>;
}

/** Run `audit --wcag --json` and return the parsed payload */
async function runAuditJson(specs: FakeSpec[], extra: string[] = []) {
  const logs = captureLogs();
  const program = new Command();
  registerAuditCommand(program, makeEngine(specs) as never);
  await program.parseAsync(["audit", "--wcag", "--json", ...extra], { from: "user" });
  return { payload: lastJson(logs), logs };
}

/** A fully-passing ComponentSpec */
function passing(name = "ButtonPrimary"): FakeSpec {
  return {
    type: "component",
    name,
    purpose: "Primary action button",
    shadcnBase: ["Button"],
    accessibility: {
      role: "button",
      ariaLabel: "required",
      keyboardNav: true,
      touchTarget: "min-44",
      focusStyle: "outline",
      colorContrast: {
        foreground: "#000000",
        background: "#ffffff",
        minimumLevel: "AA",
        assertedRatio: 21,
      },
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = 0;
});

// ── Test Suite ───────────────────────────────────────────────────

describe("audit --wcag (JSON output)", () => {
  // 1. All-passing spec → status:pass, exit 0
  it("status=pass when all checks pass", async () => {
    const { payload } = await runAuditJson([passing()]);
    expect(payload.status).toBe("pass");
    expect(process.exitCode ?? 0).toBe(0);
  });

  // 2. Missing colorContrast → warn (not fail), exit 0
  it("contrast check is warn when colorContrast field is absent", async () => {
    const spec: FakeSpec = {
      ...passing("Card"),
      accessibility: {
        ...passing("Card").accessibility,
        colorContrast: undefined,
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ name: string; checks: Record<string, { status: string; detail: string }> }>;
    expect(specs[0].checks.contrast.status).toBe("warn");
    expect(specs[0].checks.contrast.detail).toContain("no colorContrast declared");
    // Overall status is warn (not fail) because only contrast is affected and it's warn
    expect(payload.status).toBe("warn");
    // Exit code stays 0 — warn does not trigger non-zero
    expect(process.exitCode ?? 0).toBe(0);
  });

  // 3. assertedRatio < 4.5 → fail, exit 1
  it("contrast check fails when assertedRatio < 4.5 and sets exit code 1", async () => {
    const spec: FakeSpec = {
      ...passing("LowContrast"),
      accessibility: {
        ...passing("LowContrast").accessibility,
        colorContrast: { assertedRatio: 3.0, minimumLevel: "AA" },
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ checks: Record<string, { status: string }> }>;
    expect(specs[0].checks.contrast.status).toBe("fail");
    expect(payload.status).toBe("fail");
    expect(process.exitCode).toBe(1);
  });

  // 4. focusStyle "none" → fail, exit 1
  it("focus check fails when focusStyle=none", async () => {
    const spec: FakeSpec = {
      ...passing("NoFocus"),
      accessibility: {
        ...passing("NoFocus").accessibility,
        focusStyle: "none",
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ checks: Record<string, { status: string }> }>;
    expect(specs[0].checks.focus.status).toBe("fail");
    expect(payload.status).toBe("fail");
    expect(process.exitCode).toBe(1);
  });

  // 5. keyboardNav false → fail, exit 1
  it("keyboard check fails when keyboardNav=false", async () => {
    const spec: FakeSpec = {
      ...passing("NoKeyboard"),
      accessibility: {
        ...passing("NoKeyboard").accessibility,
        keyboardNav: false,
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ checks: Record<string, { status: string }> }>;
    expect(specs[0].checks.keyboard.status).toBe("fail");
    expect(process.exitCode).toBe(1);
  });

  // 6. JSON shape — top-level keys
  it("JSON output has status, specs, summary keys", async () => {
    const { payload } = await runAuditJson([passing()]);
    expect(payload).toHaveProperty("status");
    expect(payload).toHaveProperty("specs");
    expect(payload).toHaveProperty("summary");
  });

  // 7. JSON shape — specs array entry structure
  it("each spec entry has name, checks (5 keys), wcag_impact", async () => {
    const { payload } = await runAuditJson([passing()]);
    const specs = payload.specs as Array<{ name: string; checks: Record<string, unknown>; wcag_impact: string[] }>;
    expect(specs).toHaveLength(1);
    const entry = specs[0];
    expect(entry.name).toBe("ButtonPrimary");
    expect(Object.keys(entry.checks).sort()).toEqual(["aria", "contrast", "focus", "keyboard", "touch"]);
    expect(Array.isArray(entry.wcag_impact)).toBe(true);
  });

  // 8. JSON shape — summary has pass/warn/fail/total
  it("summary contains pass, warn, fail, total", async () => {
    const { payload } = await runAuditJson([passing()]);
    const summary = payload.summary as Record<string, number>;
    expect(summary).toHaveProperty("pass");
    expect(summary).toHaveProperty("warn");
    expect(summary).toHaveProperty("fail");
    expect(summary).toHaveProperty("total");
  });

  // 9. wcag_impact has correct codes for contrast fail
  it("wcag_impact includes 1.4.3 and 1.4.6 for contrast failure", async () => {
    const spec: FakeSpec = {
      ...passing("ContrastFail"),
      accessibility: {
        ...passing("ContrastFail").accessibility,
        colorContrast: { assertedRatio: 2.5, minimumLevel: "AA" },
      },
    };
    const { payload } = await runAuditJson([spec]);
    const entry = (payload.specs as Array<{ wcag_impact: string[] }>)[0];
    expect(entry.wcag_impact).toContain("1.4.3");
    expect(entry.wcag_impact).toContain("1.4.6");
  });

  // 10. wcag_impact has correct code for aria fail
  it("wcag_impact includes 4.1.2 for aria failure", async () => {
    const spec: FakeSpec = {
      ...passing("AriaFail"),
      accessibility: {
        ...passing("AriaFail").accessibility,
        role: undefined,
        ariaLabel: "none",
      },
    };
    const { payload } = await runAuditJson([spec]);
    const entry = (payload.specs as Array<{ wcag_impact: string[] }>)[0];
    expect(entry.wcag_impact).toContain("4.1.2");
  });

  // 11. wcag_impact has correct code for keyboard fail
  it("wcag_impact includes 2.1.1 for keyboard failure", async () => {
    const spec: FakeSpec = {
      ...passing("KeyboardFail"),
      accessibility: {
        ...passing("KeyboardFail").accessibility,
        keyboardNav: false,
      },
    };
    const { payload } = await runAuditJson([spec]);
    const entry = (payload.specs as Array<{ wcag_impact: string[] }>)[0];
    expect(entry.wcag_impact).toContain("2.1.1");
  });

  // 12. wcag_impact has correct code for touch warn
  it("wcag_impact includes 2.5.8 for touch warn (touchTarget=default)", async () => {
    const spec: FakeSpec = {
      ...passing("TouchWarn"),
      accessibility: {
        ...passing("TouchWarn").accessibility,
        touchTarget: "default",
      },
    };
    const { payload } = await runAuditJson([spec]);
    const entry = (payload.specs as Array<{ wcag_impact: string[] }>)[0];
    expect(entry.wcag_impact).toContain("2.5.8");
  });

  // 13. wcag_impact has correct code for focus fail
  it("wcag_impact includes 2.4.11 for focus failure", async () => {
    const spec: FakeSpec = {
      ...passing("FocusFail"),
      accessibility: {
        ...passing("FocusFail").accessibility,
        focusStyle: "none",
      },
    };
    const { payload } = await runAuditJson([spec]);
    const entry = (payload.specs as Array<{ wcag_impact: string[] }>)[0];
    expect(entry.wcag_impact).toContain("2.4.11");
  });

  // 14. --component filter narrows to matching specs
  it("--component filter narrows to matching spec names", async () => {
    const specs: FakeSpec[] = [
      passing("ButtonPrimary"),
      passing("InputField"),
      passing("CardWrapper"),
    ];
    const { payload } = await runAuditJson(specs, ["--component", "button"]);
    const resultSpecs = payload.specs as Array<{ name: string }>;
    expect(resultSpecs).toHaveLength(1);
    expect(resultSpecs[0].name).toBe("ButtonPrimary");
  });

  // 15. --component filter is case-insensitive
  it("--component filter is case-insensitive", async () => {
    const specs: FakeSpec[] = [
      passing("ButtonPrimary"),
      passing("ButtonSecondary"),
      passing("InputField"),
    ];
    const { payload } = await runAuditJson(specs, ["--component", "BUTTON"]);
    const resultSpecs = payload.specs as Array<{ name: string }>;
    expect(resultSpecs).toHaveLength(2);
    expect(resultSpecs.map((s) => s.name)).toContain("ButtonPrimary");
    expect(resultSpecs.map((s) => s.name)).toContain("ButtonSecondary");
  });

  // 16. --component with no match → empty specs, status:pass
  it("--component with no match returns empty specs array and status=pass", async () => {
    const specs: FakeSpec[] = [passing("ButtonPrimary"), passing("InputField")];
    const { payload } = await runAuditJson(specs, ["--component", "zzznomatch"]);
    expect(payload.status).toBe("pass");
    expect(payload.specs).toEqual([]);
    const summary = payload.summary as Record<string, number>;
    expect(summary.total).toBe(0);
  });

  // 17. Empty spec list → status:pass, 0 checks
  it("empty spec list produces status=pass and zero counts", async () => {
    const { payload } = await runAuditJson([]);
    expect(payload.status).toBe("pass");
    expect(payload.specs).toEqual([]);
    const summary = payload.summary as Record<string, number>;
    expect(summary.pass).toBe(0);
    expect(summary.warn).toBe(0);
    expect(summary.fail).toBe(0);
    expect(summary.total).toBe(0);
  });

  // 18. Page specs are ignored (only ComponentSpecs are audited)
  it("ignores page specs — only audits component specs", async () => {
    const mixed: FakeSpec[] = [
      passing("ButtonPrimary"),
      { type: "page", name: "Dashboard", purpose: "Main dashboard" },
    ];
    const { payload } = await runAuditJson(mixed);
    const resultSpecs = payload.specs as Array<{ name: string }>;
    expect(resultSpecs).toHaveLength(1);
    expect(resultSpecs[0].name).toBe("ButtonPrimary");
    const summary = payload.summary as Record<string, number>;
    expect(summary.total).toBe(1);
  });

  // 19. Multiple specs — summary counts are aggregated across all checks
  it("summary aggregates pass/warn/fail across all spec checks", async () => {
    const lowContrast: FakeSpec = {
      ...passing("LowContrast"),
      accessibility: {
        ...passing("LowContrast").accessibility,
        colorContrast: { assertedRatio: 3.0, minimumLevel: "AA" },
      },
    };
    // 5 checks for ButtonPrimary = all pass
    // 5 checks for LowContrast: 4 pass + 1 fail
    const { payload } = await runAuditJson([passing(), lowContrast]);
    const summary = payload.summary as Record<string, number>;
    expect(summary.fail).toBe(1);
    expect(summary.pass).toBe(9);
    expect(summary.total).toBe(2);
  });

  // 20. assertedRatio exactly 4.5 → pass (boundary)
  it("assertedRatio=4.5 is a pass (boundary condition)", async () => {
    const spec: FakeSpec = {
      ...passing("BoundaryContrast"),
      accessibility: {
        ...passing("BoundaryContrast").accessibility,
        colorContrast: { assertedRatio: 4.5, minimumLevel: "AA" },
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ checks: Record<string, { status: string }> }>;
    expect(specs[0].checks.contrast.status).toBe("pass");
    expect(process.exitCode ?? 0).toBe(0);
  });

  // 21. assertedRatio just below 4.5 → fail
  it("assertedRatio=4.49 is a fail (sub-AA)", async () => {
    const spec: FakeSpec = {
      ...passing("BoundaryFail"),
      accessibility: {
        ...passing("BoundaryFail").accessibility,
        colorContrast: { assertedRatio: 4.49, minimumLevel: "AA" },
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ checks: Record<string, { status: string }> }>;
    expect(specs[0].checks.contrast.status).toBe("fail");
    expect(process.exitCode).toBe(1);
  });

  // 22. ariaLabel=none on non-interactive component → warn (not fail)
  it("ariaLabel=none on non-interactive component is warn, not fail", async () => {
    const spec: FakeSpec = {
      type: "component",
      name: "Divider",
      purpose: "Visual separator",
      accessibility: {
        role: "separator",
        ariaLabel: "none",
        keyboardNav: true,
        touchTarget: "min-44",
        focusStyle: "outline",
        colorContrast: { assertedRatio: 5.0, minimumLevel: "AA" },
      },
    };
    const { payload } = await runAuditJson([spec]);
    const specs = payload.specs as Array<{ checks: Record<string, { status: string }> }>;
    expect(specs[0].checks.aria.status).toBe("warn");
    // warn does not cause exit 1
    expect(process.exitCode ?? 0).toBe(0);
  });

  // 23. wcag_impact is empty when all checks pass
  it("wcag_impact is empty array when spec fully passes", async () => {
    const { payload } = await runAuditJson([passing()]);
    const entry = (payload.specs as Array<{ wcag_impact: string[] }>)[0];
    expect(entry.wcag_impact).toEqual([]);
  });
});

describe("audit --wcag (terminal output)", () => {
  // 24. Terminal output mentions spec name
  it("prints spec name in terminal output", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerAuditCommand(program, makeEngine([passing()]) as never);
    await program.parseAsync(["audit", "--wcag"], { from: "user" });
    const allOutput = logs.join("\n");
    expect(allOutput).toContain("ButtonPrimary");
  });

  // 25. Terminal output includes summary line
  it("prints summary line in terminal output", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerAuditCommand(program, makeEngine([passing()]) as never);
    await program.parseAsync(["audit", "--wcag"], { from: "user" });
    const allOutput = logs.join("\n");
    expect(allOutput).toContain("summary");
  });
});

describe("audit without --wcag", () => {
  // 26. No --wcag flag → usage message, exit 0
  it("shows usage message when --wcag is not passed", async () => {
    const logs = captureLogs();
    const program = new Command();
    registerAuditCommand(program, makeEngine([passing()]) as never);
    await program.parseAsync(["audit"], { from: "user" });
    const allOutput = logs.join("\n");
    expect(allOutput).toContain("--wcag");
    expect(process.exitCode ?? 0).toBe(0);
  });
});
