import { describe, expect, it } from "vitest";
import { extractDesignTokensFromCss, extractDesignTokensFromSources } from "../extractor.js";

describe("token extractor", () => {
  it("extracts CSS variables with modes, aliases, and semantic coverage", () => {
    const report = extractDesignTokensFromCss([`
      :root {
        --background: #ffffff;
        --foreground: #111827;
        --primary: #2563eb;
        --radius: 0.75rem;
        --space-4: 1rem;
        --font-sans: Inter, sans-serif;
        --shadow-card: 0 8px 30px rgba(15, 23, 42, 0.18);
        --button-bg: var(--primary);
      }

      .dark {
        --background: #020617;
        --foreground: #f8fafc;
        --primary: #60a5fa;
      }
    `]);

    const background = report.tokens.find((token) => token.cssVariable === "--background");
    const primary = report.tokens.find((token) => token.cssVariable === "--primary");
    const radius = report.tokens.find((token) => token.cssVariable === "--radius");
    const alias = report.aliases.find((item) => item.cssVariable === "--button-bg");

    expect(background?.values.default).toBe("#ffffff");
    expect(background?.values.dark).toBe("#020617");
    expect(primary?.type).toBe("color");
    expect(radius?.type).toBe("radius");
    expect(alias?.references).toContain("--primary");
    expect(report.modes).toEqual(["default", "dark"]);
    expect(report.semanticCoverage.present).toContain("background");
    expect(report.modeCoverage.score).toBeGreaterThan(0);
    expect(report.aliasGraph.resolvedReferenceCount).toBe(1);
    expect(report.scaleHealth.overallScore).toBeGreaterThan(0);
  });

  it("promotes repeated literals into inferred tokens", () => {
    const report = extractDesignTokensFromCss([`
      .card { color: #2563eb; padding: 16px; border-radius: 12px; }
      .button { background: #2563eb; margin: 16px; border-radius: 12px; }
    `]);

    expect(report.literalCandidates.some((candidate) => candidate.value === "#2563eb")).toBe(true);
    expect(report.summary.inferredTokenCount).toBeGreaterThan(0);
    expect(report.tokens.some((token) => token.collection.startsWith("inferred-literal:"))).toBe(true);
  });

  it("can leave repeated literals as candidates only", () => {
    const report = extractDesignTokensFromCss([`
      .card { color: #2563eb; padding: 16px; }
      .button { background: #2563eb; margin: 16px; }
    `], { includeInferredLiterals: false });

    expect(report.literalCandidates.length).toBeGreaterThan(0);
    expect(report.summary.inferredTokenCount).toBe(0);
    expect(report.tokens.some((token) => token.collection.startsWith("inferred-literal:"))).toBe(false);
  });

  it("detects Tailwind utility patterns from JSX sources", () => {
    const report = extractDesignTokensFromSources([{
      id: "Button.tsx",
      kind: "tsx",
      content: `
        export function Button() {
          return <button className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-sm">Save</button>
        }
      `,
    }]);

    expect(report.utilityCandidates.map((candidate) => candidate.utility)).toEqual(
      expect.arrayContaining(["bg-blue-600", "px-4", "py-2", "rounded-lg", "shadow-sm"]),
    );
    expect(report.summary.utilityCandidateCount).toBeGreaterThan(0);
  });

  it("audits mode gaps, duplicate values, unresolved aliases, and alias cycles", () => {
    const report = extractDesignTokensFromCss([`
      :root {
        --background: #ffffff;
        --foreground: #111827;
        --primary: #2563eb;
        --accent: #2563eb;
        --broken: var(--missing-token);
        --loop-a: var(--loop-b);
        --loop-b: var(--loop-a);
      }

      .dark {
        --background: #020617;
        --foreground: #f8fafc;
      }
    `]);

    expect(report.modeCoverage.partialTokenCount).toBeGreaterThan(0);
    expect(report.modeCoverage.missingByMode.dark).toContain("--primary");
    expect(report.duplicates.some((group) => group.value === "#2563eb" && group.tokens.includes("--primary"))).toBe(true);
    expect(report.aliasGraph.unresolvedReferences).toContainEqual({ token: "--broken", reference: "--missing-token" });
    expect(report.aliasGraph.circularReferences.length).toBeGreaterThan(0);
    expect(report.recommendations.some((item) => item.priority === "high")).toBe(true);
  });
});
