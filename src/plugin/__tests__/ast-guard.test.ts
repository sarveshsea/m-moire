import { describe, expect, it } from "vitest";
import { AST_MAX_NODES, parseAndGuard } from "../main/exec/ast-guard.js";

describe("parseAndGuard — accepts safe code", () => {
  it("allows dot member access into figma", () => {
    expect(parseAndGuard("return figma.currentPage.name;").ok).toBe(true);
  });
  it("allows Math and arithmetic", () => {
    expect(parseAndGuard("return Math.max(1, 2, 3);").ok).toBe(true);
  });
  it("allows await on a getter", () => {
    expect(parseAndGuard("const x = await figma.getNodeByIdAsync('1');").ok).toBe(true);
  });
  it("allows top-level return (async IIFE wrapper)", () => {
    expect(parseAndGuard("return 42;").ok).toBe(true);
  });
  it("allows string literals that look dangerous", () => {
    // The AST doesn't treat string contents as identifiers.
    expect(parseAndGuard("return 'closePlugin is a string';").ok).toBe(true);
  });
});

describe("parseAndGuard — rejects hostile shapes", () => {
  const fixtures: Array<{ name: string; code: string }> = [
    { name: "direct closePlugin call via member", code: "figma.closePlugin();" },
    { name: "computed access with string literal", code: "figma['closePlugin']();" },
    { name: "computed access with concat is caught at the bracket", code: "figma['clos'+'ePlugin']();" },
    { name: "new Function()", code: "new Function('return 1');" },
    { name: "eval()", code: "eval('1');" },
    { name: "setTimeout()", code: "setTimeout(() => {}, 0);" },
    { name: "setInterval", code: "setInterval(() => {}, 0);" },
    { name: "dynamic import", code: "await import('./a');" },
    { name: "require", code: "require('a');" },
    { name: "(0, eval)(...)", code: "(0, eval)('1');" },
    { name: "globalThis member access", code: "globalThis.eval('x');" },
    { name: "bare eval reference", code: "const f = eval; f('1');" },
    { name: "while(true)", code: "while (true) { break; }" },
    { name: "while(1)", code: "while (1) { break; }" },
    { name: "do-while(true)", code: "do { break; } while (true);" },
    { name: "for(;;)", code: "for (;;) { break; }" },
    { name: "for(; true;)", code: "for (; true;) { break; }" },
    { name: "__proto__ access", code: "x.__proto__ = null;" },
    { name: "constructor.constructor", code: "({}).constructor.constructor('x');" },
    { name: "arrow wrapping setTimeout", code: "const f = () => setTimeout(() => {}, 0);" },
    { name: "IIFE wrapping banned call", code: "(() => eval('1'))();" },
    { name: "self access", code: "self.foo = 1;" },
    { name: "parent access", code: "parent.postMessage({}, '*');" },
    { name: "top access", code: "top.location = 'x';" },
  ];

  for (const fx of fixtures) {
    it(`rejects: ${fx.name}`, () => {
      const res = parseAndGuard(fx.code);
      expect(res.ok).toBe(false);
      expect(res.error?.code).toBe("E_EXEC_REJECTED");
    });
  }
});

describe("parseAndGuard — size limits", () => {
  it("rejects ast node count above threshold", () => {
    // Generate many AST nodes via deeply repeated binary expressions.
    const body = new Array(AST_MAX_NODES).fill("x").join(" + ");
    const res = parseAndGuard("return " + body + ";");
    expect(res.ok).toBe(false);
  });

  it("rejects syntactically invalid code with E_EXEC_REJECTED", () => {
    const res = parseAndGuard("this is not code }");
    expect(res.ok).toBe(false);
    expect(res.error?.code).toBe("E_EXEC_REJECTED");
  });
});
