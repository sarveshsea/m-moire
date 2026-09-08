import { parse } from "@babel/parser";

type Node = { type: string; [key: string]: unknown };
export interface StaticClassExtraction {
  tokens: string[];
  unknownExpressions: number;
  parseFailures: number;
}
const isNode = (value: unknown): value is Node => Boolean(value && typeof value === "object" && "type" in value);
const children = (node: Node): Node[] => Object.values(node).flatMap(value =>
  Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []);
const propertyName = (node: unknown): string | undefined => isNode(node)
  ? typeof node.name === "string" ? node.name : typeof node.value === "string" ? node.value : undefined
  : undefined;

/** Extracts possible literal classes; conditions are not proof that a class renders. Never evaluates source. */
export function extractStaticClasses(content: string, path = "source.tsx"): StaticClassExtraction {
  if (/\.(css|swift|metal)$/i.test(path)) return { tokens: [], unknownExpressions: 0, parseFailures: 0 };
  if (/\.html$/i.test(path)) {
    const tokens = [...content.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").matchAll(/\bclass\s*=\s*["']([^"']*)["']/g)]
      .flatMap(match => match[1].split(/\s+/)).filter(Boolean);
    return { tokens, unknownExpressions: 0, parseFailures: 0 };
  }
  let root: Node;
  try {
    root = parse(content, { sourceType: "unambiguous", plugins: ["typescript", "jsx"] }) as unknown as Node;
  } catch {
    return { tokens: [], unknownExpressions: 0, parseFailures: 1 };
  }
  const chunks: string[] = [];
  let unknownExpressions = 0;
  function collect(value: unknown): void {
    if (!isNode(value)) return;
    switch (value.type) {
      case "StringLiteral": chunks.push(String(value.value)); return;
      case "TemplateLiteral":
        if ((value.expressions as unknown[]).length === 0) {
          for (const quasi of value.quasis as Node[]) chunks.push(String((quasi.value as { cooked: string }).cooked));
        } else unknownExpressions++;
        return;
      case "BooleanLiteral": case "NullLiteral": case "NumericLiteral": return;
      case "JSXExpressionContainer": case "TSAsExpression": case "TSSatisfiesExpression": case "TSNonNullExpression": case "ParenthesizedExpression":
        collect(value.expression); return;
      case "ArrayExpression": for (const element of value.elements as unknown[]) collect(element); return;
      case "ConditionalExpression":
        if (isNode(value.test) && value.test.type === "BooleanLiteral") collect(value.test.value ? value.consequent : value.alternate);
        else { collect(value.consequent); collect(value.alternate); }
        return;
      case "LogicalExpression":
        if (value.operator === "&&") {
          if (!(isNode(value.left) && value.left.type === "BooleanLiteral" && value.left.value === false)) collect(value.right);
        } else { collect(value.left); collect(value.right); }
        return;
      case "ObjectExpression":
        for (const property of value.properties as Node[]) {
          if (property.type !== "ObjectProperty" || property.computed) { unknownExpressions++; continue; }
          if (isNode(property.value) && property.value.type === "BooleanLiteral" && !property.value.value) continue;
          const name = propertyName(property.key);
          if (name) chunks.push(name); else unknownExpressions++;
        }
        return;
      case "CallExpression":
        if (isNode(value.callee) && value.callee.type === "Identifier") {
          const name = propertyName(value.callee);
          if (name === "cn" || name === "clsx") { for (const argument of value.arguments as unknown[]) collect(argument); return; }
          if (name === "cva") { collectCva(value.arguments as unknown[]); return; }
        }
        unknownExpressions++; return;
      default: unknownExpressions++;
    }
  }
  function variantValues(value: unknown): void {
    if (!isNode(value)) return;
    if (value.type === "ObjectExpression") {
      for (const property of value.properties as Node[]) {
        if (property.type === "ObjectProperty" && !property.computed) variantValues(property.value);
        else unknownExpressions++;
      }
    } else collect(value);
  }
  function collectCva(args: unknown[]): void {
    collect(args[0]);
    const options = args[1];
    if (!options) return;
    if (!isNode(options) || options.type !== "ObjectExpression") { unknownExpressions++; return; }
    for (const property of options.properties as Node[]) {
      const name = propertyName(property.key);
      if (property.type !== "ObjectProperty" || property.computed) { unknownExpressions++; continue; }
      if (name === "variants") variantValues(property.value);
      if (name === "compoundVariants") {
        if (!isNode(property.value) || property.value.type !== "ArrayExpression") { unknownExpressions++; continue; }
        for (const variant of property.value.elements as Node[]) {
          if (!variant || variant.type !== "ObjectExpression") { unknownExpressions++; continue; }
          for (const entry of variant.properties as Node[]) {
            if (["class", "className"].includes(propertyName(entry.key) ?? "")) collect(entry.value);
            else if (entry.type === "SpreadElement") unknownExpressions++;
          }
        }
      }
    }
  }
  function visit(node: Node): void {
    if (node.type === "JSXAttribute" && ["class", "className"].includes(propertyName(node.name) ?? "")) {
      collect(node.value); return;
    }
    if (node.type === "CallExpression" && isNode(node.callee) && node.callee.type === "Identifier"
      && ["cn", "clsx", "cva"].includes(propertyName(node.callee) ?? "")) {
      collect(node); return;
    }
    for (const child of children(node)) visit(child);
  }
  visit(root);
  return { tokens: chunks.flatMap(chunk => chunk.split(/\s+/)).filter(Boolean), unknownExpressions, parseFailures: 0 };
}
