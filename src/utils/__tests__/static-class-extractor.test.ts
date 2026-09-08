import { describe, expect, it } from "vitest";
import { extractStaticClasses } from "../static-class-extractor.js";

describe("static class extraction", () => {
  it("extracts helper arrays, object keys, ternaries and cva class variants only", () => {
    const result = extractStaticClasses(`const v = cva("p-4", {
      variants: { tone: { primary: "bg-blue-500", danger: ["bg-red-500", "text-white"] } },
      defaultVariants: { tone: "do-not-collect" },
      compoundVariants: [{ tone: "also-not-a-class", className: "focus-visible:ring-2" }]
    });
    const view = <div className={cn(["rounded", active && "shadow"], clsx({ "text-sm": active, "never": false }), active ? "p-2" : "p-3")} />;`);
    expect(result.tokens).toEqual(["p-4", "bg-blue-500", "bg-red-500", "text-white", "focus-visible:ring-2", "rounded", "shadow", "text-sm", "p-2", "p-3"]);
    expect(result.unknownExpressions).toBe(0);
  });
  it("ignores comments and unrelated strings while reporting dynamic expressions", () => {
    const result = extractStaticClasses(`// cn("focus:ring-2")
const description = 'className="focus:ring-2"';
const view = <button className={cn(dynamic(), className, \`bg-\${color}-500\`, false && "focus:ring-2")} />;`);
    expect(result.tokens).toEqual([]);
    expect(result.unknownExpressions).toBe(3);
  });
  it("reports malformed source instead of pretending extraction succeeded", () => {
    expect(extractStaticClasses('const view = <button className={cn("p-4"')).toEqual({ tokens: [], unknownExpressions: 0, parseFailures: 1 });
  });
  it("does not treat variant selectors and interpolated templates as literal classes", () => {
    const result = extractStaticClasses('const x = <div className={cn({ [getClass()]: active }, `p-${size}`)} />;');
    expect(result.tokens).toEqual([]);
    expect(result.unknownExpressions).toBe(2);
  });
  it("ignores HTML comments and script text", () => {
    const result = extractStaticClasses('<script>const x = \'class="focus:ring"\';</script><!-- class="hidden" --><button class="p-4">Go</button>', "page.html");
    expect(result.tokens).toEqual(["p-4"]);
  });
});
