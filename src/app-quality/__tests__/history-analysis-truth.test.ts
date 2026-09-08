import { describe, expect, it } from "vitest";
import { entryFromDiagnosis, checkRegression } from "../history.js";
import type { AppQualityDiagnosis } from "../engine.js";
const base = {
  generatedAt: "2026-09-08T00:00:00Z", target: ".", summary: { score: 100, scanTarget: ".", scanLimit: 500 },
  scores: { spacing: 100 }, issues: [], sourceCoverage: {}, policy: { hash: "same" },
} as unknown as AppQualityDiagnosis;
const current = { ...base, generatedAt: "2026-09-09T00:00:00Z", quality: { score: 100, categories: { spacing: 100 }, coverage: 1 / 8, scope: "scanned-files" },
  scanCompleteness: { complete: true, omissions: [] } } as unknown as AppQualityDiagnosis;
describe("analysis-model history identity", () => {
  it("does not compare assessed-only scores to historical zero-filled averages", () => {
    expect(checkRegression(entryFromDiagnosis(current), [entryFromDiagnosis(base)], 0).comparable).toBe(false);
  });
  it("does not label an incomplete scan full or compare it with a full scan", () => {
    const partial = entryFromDiagnosis({ ...current, scanCompleteness: { ...current.scanCompleteness, complete: false, omissions: [{ path: "z.tsx", reason: "max-files" }] } });
    expect(partial.scope).toBe("scoped");
    expect(checkRegression(partial, [entryFromDiagnosis(current)], 0).comparable).toBe(false);
  });
  it("invalidates comparisons when class parse coverage changes", () => {
    const partial = entryFromDiagnosis({ ...current, classExtraction: { parseFailures: 1, unknownExpressions: 0 } });
    expect(partial.coverageFingerprint).not.toBe(entryFromDiagnosis(current).coverageFingerprint);
  });
});
