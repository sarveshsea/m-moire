/**
 * Dev Annotations — Generates developer-friendly annotations for Figma components.
 *
 * Creates rich text descriptions that appear in Figma's dev mode inspect panel,
 * showing implementation details, props, tokens, accessibility, and notes.
 */

import { createLogger } from "../engine/logger.js";
import type { ComponentSpec, PageSpec } from "../specs/types.js";
import type { ComposedScreen } from "./screen-composer.js";
import type { DesignToken } from "../engine/registry.js";

const log = createLogger("dev-annotations");

// ── Data Structures ────────────────────────────────────────

export interface PropAnnotation {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description: string;
}

export interface TokenAnnotation {
  token: string; // --background
  value: string; // #ffffff
  tailwindClass: string; // bg-background
  usage: string; // "Card background color"
}

export interface DevAnnotation {
  nodeId: string;
  nodeName: string;
  type: "component" | "section" | "page" | "token";
  codeSnippet: string; // Full React JSX
  importStatement: string; // import { Button } from "@/components/ui/button"
  props: PropAnnotation[];
  cssClasses: string[]; // Tailwind classes used
  designTokens: TokenAnnotation[];
  accessibility: {
    role?: string;
    ariaLabel?: string;
    keyboardNav?: string;
  };
  notes: string[];
}

// ── Dev Annotator ──────────────────────────────────────────

export class DevAnnotator {
  private log = log;

  /**
   * Generate annotations for a composed screen.
   */
  annotateScreen(
    screen: ComposedScreen,
    specs: Map<string, ComponentSpec>,
    designTokens?: DesignToken[]
  ): DevAnnotation[] {
    const annotations: DevAnnotation[] = [];

    // Page-level annotation
    annotations.push(this.annotatePage(screen.metadata.pageSpec));

    // Component annotations
    screen.metadata.resolvedComponentSpecs.forEach((spec, specName) => {
      annotations.push(this.annotateComponent(spec, designTokens || []));
    });

    return annotations;
  }

  /**
   * Generate annotation for a single component spec.
   */
  annotateComponent(spec: ComponentSpec, designTokens: DesignToken[] = []): DevAnnotation {
    const codeSnippet = this.generateCodeSnippet(spec);
    const importStatement = this.generateImportStatement(spec);
    const props = this.buildProps(spec);
    const cssClasses = this.extractTailwindClasses(spec);
    const tokens = this.extractTokensForComponent(spec, designTokens);
    const a11y = this.buildAccessibilityInfo(spec);
    const notes = this.buildNotes(spec);

    return {
      nodeId: `component_${spec.name}`,
      nodeName: spec.name,
      type: "component",
      codeSnippet,
      importStatement,
      props,
      cssClasses,
      designTokens: tokens,
      accessibility: a11y,
      notes,
    };
  }

  /**
   * Generate annotation for a page spec.
   */
  private annotatePage(pageSpec: PageSpec): DevAnnotation {
    return {
      nodeId: `page_${pageSpec.name}`,
      nodeName: pageSpec.name,
      type: "page",
      codeSnippet: `export function ${pageSpec.name}() {\n  return (\n    // Page layout: ${pageSpec.layout}\n  );\n}`,
      importStatement: `import { ${pageSpec.name} } from "@/app/pages/${pageSpec.name}"`,
      props: [],
      cssClasses: this.getLayoutClasses(pageSpec.layout),
      designTokens: [],
      accessibility: {
        role: "main",
      },
      notes: [
        `Layout: ${pageSpec.layout}`,
        `Purpose: ${pageSpec.purpose}`,
        `Sections: ${pageSpec.sections.length}`,
        `Research backing: ${pageSpec.researchBacking.length} references`,
      ],
    };
  }

  /**
   * Format annotation as Figma-compatible description text.
   */
  formatForFigma(annotation: DevAnnotation): string {
    const lines: string[] = [];

    // Header with emoji and component name
    lines.push(`📦 ${annotation.nodeName}`);
    lines.push("━".repeat(50));
    lines.push("");

    // Import statement
    lines.push(annotation.importStatement);
    lines.push("");

    // Code snippet
    lines.push("```jsx");
    lines.push(annotation.codeSnippet);
    lines.push("```");
    lines.push("");

    // Props table
    if (annotation.props.length > 0) {
      lines.push("Props:");
      for (const prop of annotation.props) {
        const required = prop.required ? "(required)" : "(optional)";
        const defaultStr = prop.default ? ` = ${prop.default}` : "";
        lines.push(
          `  ${prop.name}: ${prop.type} ${required}${defaultStr}`
        );
        if (prop.description) {
          lines.push(`    → ${prop.description}`);
        }
      }
      lines.push("");
    }

    // Tailwind classes
    if (annotation.cssClasses.length > 0) {
      lines.push("Tailwind:");
      lines.push(`  ${annotation.cssClasses.join(" ")}`);
      lines.push("");
    }

    // Design tokens
    if (annotation.designTokens.length > 0) {
      lines.push("Tokens:");
      for (const token of annotation.designTokens) {
        lines.push(`  ${token.token}: ${token.value} (${token.tailwindClass})`);
        if (token.usage) {
          lines.push(`    → ${token.usage}`);
        }
      }
      lines.push("");
    }

    // Accessibility
    if (annotation.accessibility.role || annotation.accessibility.ariaLabel) {
      lines.push("A11y:");
      if (annotation.accessibility.role) {
        lines.push(`  role="${annotation.accessibility.role}"`);
      }
      if (annotation.accessibility.ariaLabel) {
        lines.push(`  aria-label="${annotation.accessibility.ariaLabel}"`);
      }
      if (annotation.accessibility.keyboardNav) {
        lines.push(`  Keyboard navigation: ${annotation.accessibility.keyboardNav}`);
      }
      lines.push("");
    }

    // Notes
    if (annotation.notes.length > 0) {
      lines.push("Notes:");
      for (const note of annotation.notes) {
        lines.push(`  • ${note}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Generate a code snippet for a component with its props.
   */
  generateCodeSnippet(spec: ComponentSpec, variant?: string): string {
    const lines: string[] = [];

    // Opening tag with variant
    let tagOpen = `<${spec.name}`;
    if (variant) {
      tagOpen += ` variant="${variant}"`;
    }

    // Add sample props
    const propEntries = Object.entries(spec.props).slice(0, 3); // Show first 3 props
    if (propEntries.length > 0) {
      lines.push(tagOpen);
      for (const [name, type] of propEntries) {
        const sampleValue = this.generateSampleValue(name, type);
        lines.push(`  ${name}=${sampleValue}`);
      }
      if (Object.entries(spec.props).length > 3) {
        lines.push(`  // ... ${Object.entries(spec.props).length - 3} more props`);
      }
      lines.push("/>");
    } else {
      lines.push(`${tagOpen} />`);
    }

    return lines.join("\n");
  }

  /**
   * Build prop annotation array from spec.
   */
  private buildProps(spec: ComponentSpec): PropAnnotation[] {
    const props: PropAnnotation[] = [];

    for (const [name, type] of Object.entries(spec.props)) {
      const required = !type.endsWith("?");
      const cleanType = type.replace("?", "").trim();

      props.push({
        name,
        type: cleanType,
        required,
        description: this.getPropDescription(name, spec),
      });
    }

    return props;
  }

  /**
   * Generate import statement for a component.
   */
  private generateImportStatement(spec: ComponentSpec): string {
    return `import { ${spec.name} } from "@/components/ui/${this.kebabCase(spec.name)}"`;
  }

  /**
   * Extract Tailwind classes mentioned in component spec.
   */
  private extractTailwindClasses(spec: ComponentSpec): string[] {
    const classes: string[] = [];

    // Common Tailwind classes for shadcn components
    const shadcnDefaults: Record<string, string[]> = {
      Card: ["rounded-lg", "border", "bg-card", "p-6"],
      Button: ["inline-flex", "items-center", "justify-center", "rounded-md", "font-medium", "h-10", "px-4"],
      Badge: ["inline-flex", "items-center", "rounded-full", "px-2.5", "py-0.5", "text-xs", "font-semibold"],
      Input: ["flex", "h-10", "w-full", "rounded-md", "border", "border-input", "bg-background", "px-3", "py-2"],
      Dialog: ["fixed", "inset-0", "z-50", "bg-black/80"],
      Select: ["relative", "w-full"],
      Avatar: ["relative", "inline-flex", "h-10", "w-10", "shrink-0", "overflow-hidden", "rounded-full"],
    };

    // Add base component classes
    for (const base of spec.shadcnBase) {
      classes.push(...(shadcnDefaults[base] || []));
    }

    // Remove duplicates and return
    return Array.from(new Set(classes));
  }

  /**
   * Extract design tokens used by a component.
   */
  private extractTokensForComponent(
    spec: ComponentSpec,
    designTokens: DesignToken[]
  ): TokenAnnotation[] {
    const tokens: TokenAnnotation[] = [];

    // Map common component features to tokens
    const tokenMappings: Record<string, { token: string; tailwindClass: string; usage: string }> = {
      Card: {
        token: "--card",
        tailwindClass: "bg-card",
        usage: "Card background color",
      },
      Button: {
        token: "--primary",
        tailwindClass: "bg-primary",
        usage: "Button background color",
      },
      Badge: {
        token: "--secondary",
        tailwindClass: "bg-secondary",
        usage: "Badge background color",
      },
    };

    for (const base of spec.shadcnBase) {
      const mapping = tokenMappings[base];
      if (mapping) {
        // Look up actual token value
        const actualToken = designTokens.find((t) => t.name === mapping.token.slice(2)); // Remove "--"
        const tokenValue = actualToken?.values[Object.keys(actualToken.values)[0]];
        const valueStr = typeof tokenValue === "string" ? tokenValue : (tokenValue?.toString() ?? "#000000");
        tokens.push({
          token: mapping.token,
          value: valueStr,
          tailwindClass: mapping.tailwindClass,
          usage: mapping.usage,
        });
      }
    }

    return tokens;
  }

  /**
   * Build accessibility information.
   */
  private buildAccessibilityInfo(spec: ComponentSpec): DevAnnotation["accessibility"] {
    return {
      role: spec.accessibility?.role,
      ariaLabel:
        spec.accessibility?.ariaLabel === "required"
          ? "aria-label required"
          : spec.accessibility?.ariaLabel === "optional"
            ? "aria-label optional"
            : undefined,
      keyboardNav: spec.accessibility?.keyboardNav ? "Full keyboard navigation support" : undefined,
    };
  }

  /**
   * Build notes array from spec.
   */
  private buildNotes(spec: ComponentSpec): string[] {
    const notes: string[] = [];

    if (spec.purpose) {
      notes.push(`Purpose: ${spec.purpose}`);
    }

    if (spec.variants.length > 1) {
      notes.push(`Variants: ${spec.variants.join(", ")}`);
    }

    if (spec.researchBacking.length > 0) {
      notes.push(`Research backed (${spec.researchBacking.length} sources)`);
    }

    if (spec.dataviz) {
      notes.push(`Contains data visualization: ${spec.dataviz}`);
    }

    if (spec.tags.length > 0) {
      notes.push(`Tags: ${spec.tags.join(", ")}`);
    }

    return notes;
  }

  /**
   * Generate a sample value for a prop based on its name.
   */
  private generateSampleValue(propName: string, propType: string): string {
    const lower = propName.toLowerCase();

    // Boolean
    if (propType.includes("boolean")) {
      return "true";
    }

    // String variants
    if (lower.includes("variant") || lower.includes("state")) {
      return '"default"';
    }

    // Numbers
    if (propType.includes("number")) {
      return "42";
    }

    // Arrays
    if (propType.includes("[]")) {
      return '[]';
    }

    // Default string
    return '"sample text"';
  }

  /**
   * Get a description for a prop based on its name.
   */
  private getPropDescription(propName: string, spec: ComponentSpec): string {
    const lower = propName.toLowerCase();

    if (lower.includes("title")) return "Main title or heading text";
    if (lower.includes("description") || lower.includes("desc")) return "Descriptive subtitle or secondary text";
    if (lower.includes("label")) return "Label for the component";
    if (lower.includes("variant")) return `Visual style variant (${spec.variants.join(", ")})`;
    if (lower.includes("disabled")) return "Whether the component is disabled";
    if (lower.includes("loading")) return "Whether the component is in a loading state";
    if (lower.includes("error")) return "Error message or error state";
    if (lower.includes("icon")) return "Icon element or icon name";
    if (lower.includes("click") || lower.includes("on")) return "Event handler callback";

    return `${propName} prop`;
  }

  /**
   * Get Tailwind classes for a page layout.
   */
  private getLayoutClasses(layout: string): string[] {
    const layouts: Record<string, string[]> = {
      "sidebar-main": [
        "flex",
        "min-h-screen",
        "bg-background",
      ],
      "full-width": [
        "w-full",
        "min-h-screen",
        "bg-background",
      ],
      centered: [
        "flex",
        "items-center",
        "justify-center",
        "min-h-screen",
        "bg-background",
      ],
      split: [
        "grid",
        "grid-cols-2",
        "min-h-screen",
        "bg-background",
      ],
      dashboard: [
        "flex",
        "min-h-screen",
        "bg-background",
      ],
      marketing: [
        "w-full",
        "min-h-screen",
        "bg-background",
      ],
    };

    return layouts[layout] || layouts["full-width"];
  }

  /**
   * Convert a string to kebab-case.
   */
  private kebabCase(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      .toLowerCase();
  }
}

export default DevAnnotator;
