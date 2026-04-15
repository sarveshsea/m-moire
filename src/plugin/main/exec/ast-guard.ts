// Real-AST guard for executeCode. Complements the regex-based
// normalizeCode denylist in exec/sandbox.ts: that catches most obvious
// obfuscation; this walks an actual ESTree parse so we can reason about
// node *structure* instead of source text.
//
// We deliberately keep both passes because they catch different classes:
// - normalizeCode defends against unparseable / cheap-string bypass attempts
//   before we pay the parser cost
// - parseAndGuard defends against semantically dangerous shapes that only
//   an AST can see (computed member access across multi-expression chains,
//   IIFE wrappers, arrow functions that smuggle banned identifiers, etc.)
//
// Acorn is ~170KB bundled; it's a devDependency in package.json and is
// bundled directly into plugin/code.js by Vite. No runtime download.

import * as acorn from "acorn";
import type { Node } from "acorn";
import { makeError, type WidgetError } from "../../shared/errors.js";

// Identifiers banned regardless of context. Same list as sandbox.ts so the
// two passes stay in agreement.
const BANNED_IDENTIFIERS = new Set([
  "closePlugin",
  "removePage",
  "__proto__",
  "__defineGetter__",
  "__defineSetter__",
  "constructor",
  "prototype",
  "eval",
  "Function",
  "setTimeout",
  "setInterval",
  "requestAnimationFrame",
  "require",
  "globalThis",
  "window",
  "self",
  "parent",
  "top",
]);

const PROTECTED_ROOTS = new Set(["figma", "globalThis", "window", "self"]);

export const AST_MAX_NODES = 20_000;

export interface AstGuardResult {
  ok: boolean;
  error?: WidgetError;
  nodeCount?: number;
}

export function parseAndGuard(source: string): AstGuardResult {
  let ast: acorn.Program;
  try {
    // Wrap in an async IIFE shape so top-level `await` and `return` parse.
    // This mirrors what the actual executor does at runtime.
    const wrapped = "(async function(){" + source + "\n})()";
    ast = acorn.parse(wrapped, {
      ecmaVersion: 2022,
      sourceType: "script",
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
    });
  } catch (parseError) {
    return {
      ok: false,
      error: makeError("E_EXEC_REJECTED", "execute: code failed to parse", {
        detail: { reason: parseError instanceof Error ? parseError.message : String(parseError) },
        retryable: false,
      }),
    };
  }

  let nodeCount = 0;
  let rejection: { reason: string; detail?: Record<string, unknown> } | null = null;

  const visit = (node: Node | null | undefined): void => {
    if (!node || rejection) return;
    nodeCount += 1;
    if (nodeCount > AST_MAX_NODES) {
      rejection = { reason: "AST node count exceeded", detail: { max: AST_MAX_NODES } };
      return;
    }

    switch (node.type) {
      case "NewExpression": {
        const n = node as acorn.NewExpression;
        if (n.callee.type === "Identifier" && BANNED_IDENTIFIERS.has(n.callee.name)) {
          rejection = { reason: "Banned constructor: " + n.callee.name, detail: { kind: "NewExpression" } };
          return;
        }
        break;
      }
      case "CallExpression": {
        const n = node as acorn.CallExpression;
        if (n.callee.type === "Identifier" && BANNED_IDENTIFIERS.has(n.callee.name)) {
          rejection = { reason: "Banned call: " + n.callee.name + "()", detail: { kind: "CallExpression" } };
          return;
        }
        // Catch `(0, eval)(...)` where callee is a SequenceExpression ending in eval.
        if (n.callee.type === "SequenceExpression") {
          const tail = n.callee.expressions[n.callee.expressions.length - 1];
          if (tail && tail.type === "Identifier" && BANNED_IDENTIFIERS.has(tail.name)) {
            rejection = { reason: "Banned sequence call: " + tail.name, detail: { kind: "SequenceExpression" } };
            return;
          }
        }
        // Dynamic `import(...)` is parsed as an ImportExpression in acorn,
        // not a CallExpression — caught in the generic switch below.
        break;
      }
      case "ImportExpression": {
        rejection = { reason: "Dynamic import() is not allowed", detail: { kind: "ImportExpression" } };
        return;
      }
      case "MemberExpression": {
        const n = node as acorn.MemberExpression;
        // Reject computed access against protected roots.
        if (
          n.computed &&
          n.object.type === "Identifier" &&
          PROTECTED_ROOTS.has(n.object.name)
        ) {
          rejection = {
            reason: "Computed access to " + n.object.name + "[] is not allowed",
            detail: { kind: "MemberExpression.computed" },
          };
          return;
        }
        // Reject property name hits on the denylist whether dot-accessed or
        // computed-string-literal-accessed.
        if (!n.computed && n.property.type === "Identifier" && BANNED_IDENTIFIERS.has(n.property.name)) {
          rejection = {
            reason: "Banned member: ." + n.property.name,
            detail: { kind: "MemberExpression.static" },
          };
          return;
        }
        if (
          n.computed &&
          n.property.type === "Literal" &&
          typeof (n.property as acorn.Literal).value === "string" &&
          BANNED_IDENTIFIERS.has(String((n.property as acorn.Literal).value))
        ) {
          rejection = {
            reason: "Banned computed property: [" + String((n.property as acorn.Literal).value) + "]",
            detail: { kind: "MemberExpression.computedLiteral" },
          };
          return;
        }
        break;
      }
      case "Identifier": {
        // Bare reference to a protected global outside a member expression
        // (e.g. `const f = eval;`) is also rejected.
        const n = node as acorn.Identifier;
        if (BANNED_IDENTIFIERS.has(n.name)) {
          rejection = { reason: "Banned identifier reference: " + n.name, detail: { kind: "Identifier" } };
          return;
        }
        break;
      }
      case "WhileStatement":
      case "DoWhileStatement": {
        const n = node as acorn.WhileStatement | acorn.DoWhileStatement;
        if (isTruthyLiteral(n.test)) {
          rejection = { reason: "Infinite loop (while/do-while with literal true)", detail: { kind: node.type } };
          return;
        }
        break;
      }
      case "ForStatement": {
        const n = node as acorn.ForStatement;
        if (n.test === null || isTruthyLiteral(n.test)) {
          rejection = { reason: "Infinite for-loop (empty or literal-true test)", detail: { kind: "ForStatement" } };
          return;
        }
        break;
      }
      default:
        break;
    }

    // Generic recursion over child nodes. acorn AST nodes are plain objects
    // whose children live on well-known property names; we walk anything
    // that's an object with a string `type` or an array of them.
    for (const key of Object.keys(node)) {
      if (key === "type" || key === "start" || key === "end" || key === "loc" || key === "range") continue;
      const child = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(child)) {
        for (const item of child) if (isAstNode(item)) visit(item);
      } else if (isAstNode(child)) {
        visit(child);
      }
    }
  };

  visit(ast);

  if (rejection !== null) {
    const r = rejection as { reason: string; detail?: Record<string, unknown> };
    return {
      ok: false,
      error: makeError("E_EXEC_REJECTED", r.reason, { detail: r.detail, retryable: false }),
      nodeCount,
    };
  }
  return { ok: true, nodeCount };
}

function isAstNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

function isTruthyLiteral(test: Node | null | undefined): boolean {
  if (!test) return true;
  if (test.type !== "Literal") return false;
  const v = (test as acorn.Literal).value;
  return v === true || v === 1 || v === "1";
}
