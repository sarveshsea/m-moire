import { afterEach, describe, expect, it, vi } from "vitest";
import { buildResearchPlan, executeWebResearch, executeWebResearchWithPlan, fetchUrl, processWebContent, type FindingCategory } from "../web-researcher.js";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const topic = "navigation settings";
const text = "Users need persistent navigation settings labels to locate their profile and account controls without searching through hidden menus.";
const page = (url: string, content = text) => ({ url, title: "Navigation findings", content });

describe("web research evidence processing", () => {
  it("does not equate repeated paragraphs from one source with corroboration", () => {
    const result = processWebContent(topic, [page("https://example.test/a", `${text}\n\n${text}`)]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ confidence: "low", sourceUrls: ["https://example.test/a"], category: "user-need" });
    expect(result.crossValidated).toEqual([]);
    expect(result.gaps.some((gap) => gap.includes("No high-confidence"))).toBe(true);
  });
  it.each([[2, "medium"], [3, "high"]])("raises corroboration for %s distinct sources", (count, confidence) => {
    const pages = Array.from({ length: count }, (_, index) => page(`https://source${index}.test`, index === count - 1 ? `${text} Interviews provide supporting examples.` : text));
    const result = processWebContent(topic, pages);
    expect(result.findings).toHaveLength(1);
    expect(result.crossValidated).toHaveLength(1);
    expect(result.findings[0]).toMatchObject({ confidence, text: `${text} Interviews provide supporting examples.` });
    expect(result.findings[0].sourceUrls).toHaveLength(count);
  });
  it.each([
    "short", "x".repeat(2100), `Menu ${text}`, `Subscribe ${text}`, `${text} https://a.test https://b.test https://c.test https://d.test`,
    "navigation settings labels help people understand account controls and profile actions without searching through hidden menus",
  ])("filters non-substantive or boilerplate paragraphs", (content) => {
    const result = processWebContent(topic, [page("invalid-url", content)]);
    expect(result.findings).toEqual([]);
    expect(result.sources[0].domain).toBe("unknown");
    expect(result.sources[0].snippet).toBe(content.slice(0, 300));
  });
  it("keeps unrelated low-relevance paragraphs out of findings", () => {
    const content = "The astronomy observatory contains detailed explanations of distant galaxies and their motion across the visible universe.";
    expect(processWebContent(topic, [page("https://example.test", content)]).findings).toEqual([]);
  });
  it.each([
    ["best-practice", "Guidelines recommend persistent labels for navigation settings so people can find profiles and accounts with predictable effort."],
    ["pain-point", "A serious problem in navigation settings makes profiles difficult to locate and account controls harder to discover during onboarding."],
    ["market-data", "Market growth for navigation settings tooling reached $10 million as organizations invested in faster account administration workflows."],
    ["design-pattern", "The design system layout groups navigation settings into coherent profile sections with consistent spacing and visual hierarchy."],
    ["technical-constraint", "Browser support for navigation settings affects compatibility across devices and requires careful testing of account access workflows."],
    ["competitor-insight", "An alternative competitor groups navigation settings under a visible profile menu, compared to products with scattered account controls."],
    ["regulatory", "WCAG compliance in navigation settings includes keyboard access, clear labels, and accessible profile controls across all account screens."],
    ["general", "The navigation settings organize personal profile preferences and account controls into visible sections that remain consistent across sessions."],
  ] satisfies Array<[FindingCategory, string]>)("classifies substantive %s evidence", (category, content) => {
    const result = processWebContent(topic, [page("https://www.example.test", content)]);
    expect(result.findings[0]?.category).toBe(category);
    expect(result.sources[0].domain).toBe("example.test");
  });
  it("extracts named technology and regulatory evidence without inventing entities", () => {
    const content = "Research findings about navigation settings identify React, Figma, and WCAG as relevant references for account screen design with a $20M investment.";
    const result = processWebContent(topic, [page("https://example.test", content)]);
    expect(result.findings[0].entities).toEqual(expect.arrayContaining(["React", "Figma", "WCAG", "$20M"]));
    expect(result.sources[0].relevanceScore).toBeGreaterThan(20);
  });
  it("surfaces compliance and missing-source gaps for regulated domains", () => {
    const result = processWebContent("health finance", []);
    expect(result.sources).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(result.gaps.some((gap) => gap.includes("compliance"))).toBe(true);
    expect(result.summary).toContain("0 sources");
  });
  it.each(["quick", "standard", "deep"] as const)("creates a %s host research plan with executable processing callback", (depth) => {
    const planned = executeWebResearchWithPlan(topic, { depth, focus: ["market-data", "competitor-insight", "regulatory"] });
    expect(planned.plan.queries[0]).toBe(topic);
    expect(planned.plan.focusAreas).toEqual(["market-data", "competitor-insight", "regulatory"]);
    expect(planned.plan.queries).toEqual(expect.arrayContaining([`${topic} alternatives comparison review`, `${topic} compliance legal requirements`, `${topic} market size revenue statistics`]));
    expect(planned.processResults([page("https://example.test")]).findings).toHaveLength(1);
  });
  it("defaults the plan to broad coverage when no focus is supplied", () => {
    const plan = buildResearchPlan(topic);
    expect(plan.focusAreas).toEqual(["best-practice", "user-need", "pain-point", "design-pattern"]);
    expect(plan.expectedSources).toBe(12);
  });
});

describe("web fetch failure and normalization", () => {
  it("strips executable and navigation markup while preserving readable page text", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('<html><title> Navigation\n Review </title><script>private-script</script><style>private-style</style><nav>private-nav</nav><header>private-header</header><footer>private-footer</footer><p>A&nbsp;&amp;&lt;&gt;&quot;&#39; B</p></html>')));
    const result = await fetchUrl("https://example.test", { timeoutMs: 100 });
    expect(result).toMatchObject({ ok: true, title: "Navigation Review" });
    expect(result.content).toContain('A &<>"\' B');
    expect(result.content).not.toContain("private-");
  });
  it("uses the requested URL when the document has no title", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("plain content")));
    expect(await fetchUrl("https://example.test")).toMatchObject({ ok: true, title: "https://example.test", content: "plain content" });
  });
  it("preserves HTTP failure status without analyzing the error page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private diagnostic", { status: 503 })));
    expect(await fetchUrl("https://example.test")).toEqual({ url: "https://example.test", title: "", content: "", ok: false, error: "HTTP 503" });
  });
  it.each([new Error("offline"), "transport unavailable"])("normalizes rejected requests", async (error) => {
    vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    expect(await fetchUrl("https://example.test", { timeoutMs: 10 })).toMatchObject({ ok: false, error: error instanceof Error ? error.message : error });
    await vi.runAllTimersAsync();
  });
  it("aborts an unresponsive fetch at the requested timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted"))))));
    const pending = fetchUrl("https://example.test", { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect(await pending).toMatchObject({ ok: false, error: "aborted" });
  });
  it("limits concurrent requests and excludes unsuccessful pages", async () => {
    let active = 0; let maximum = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { active++; maximum = Math.max(maximum, active); await new Promise((resolve) => setTimeout(resolve, 1)); active--; return new Response(text, { status: url.endsWith("/bad") ? 404 : 200 }); }));
    const urls = ["https://a.test", "https://b.test", "https://c.test", "https://d.test/bad"];
    const result = await executeWebResearch(topic, urls, { concurrency: 2, timeoutMs: 100 });
    expect(maximum).toBe(2);
    expect(result.sources).toHaveLength(3);
    expect(result.findings[0].confidence).toBe("high");
    expect(result.sources.map((source) => source.url)).not.toContain(urls[3]);
  });
});
