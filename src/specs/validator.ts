/**
 * Spec Validator — Validates specs against their schemas
 * and checks cross-references (e.g., page sections referencing component specs).
 */

import { z } from "zod";
import {
  ComponentSpecSchema,
  PageSpecSchema,
  DataVizSpecSchema,
  DesignSpecSchema,
  IASpecSchema,
  AnySpec,
} from "./types.js";
import { Registry } from "../engine/registry.js";

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationWarning {
  path: string;
  message: string;
  suggestion?: string;
}

export function validateSpec(spec: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const raw = spec as Record<string, unknown>;
  if (!raw?.type) {
    return {
      valid: false,
      errors: [{ path: "type", message: "Spec must have a 'type' field" }],
      warnings: [],
    };
  }

  // Validate name is a valid identifier
  if (typeof raw.name === "string") {
    if (raw.name.length === 0) {
      errors.push({ path: "name", message: "Spec name cannot be empty" });
    } else if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(raw.name)) {
      errors.push({ path: "name", message: "Spec name must start with a letter and contain only letters, numbers, hyphens, or underscores" });
    }
  }

  // Validate against schema
  let result: z.SafeParseReturnType<unknown, unknown>;
  switch (raw.type) {
    case "component":
      result = ComponentSpecSchema.safeParse(spec);
      break;
    case "page":
      result = PageSpecSchema.safeParse(spec);
      break;
    case "dataviz":
      result = DataVizSpecSchema.safeParse(spec);
      break;
    case "design":
      result = DesignSpecSchema.safeParse(spec);
      break;
    case "ia":
      result = IASpecSchema.safeParse(spec);
      break;
    default:
      return {
        valid: false,
        errors: [{ path: "type", message: `Unknown spec type: ${raw.type}` }],
        warnings: [],
      };
  }

  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({
        path: issue.path.join("."),
        message: issue.message,
      });
    }
  }

  // Warnings for common issues
  if (raw.type === "component") {
    const comp = raw as Record<string, unknown>;
    if (!comp.shadcnBase || (comp.shadcnBase as string[]).length === 0) {
      warnings.push({
        path: "shadcnBase",
        message: "No shadcn base components specified",
        suggestion: "Consider using Card, Button, Badge, or other shadcn primitives",
      });
    }
    if (!comp.purpose || (comp.purpose as string).length < 10) {
      warnings.push({
        path: "purpose",
        message: "Purpose is too brief",
        suggestion: "Describe what the component does and why it exists in 1-2 sentences",
      });
    }

    // Atomic Design validation
    const level = comp.level as string | undefined;
    const composesSpecs = comp.composesSpecs as string[] | undefined;
    const shadcnBase = comp.shadcnBase as string[] | undefined;

    if (!level) {
      warnings.push({
        path: "level",
        message: "No atomic design level specified",
        suggestion: "Set level to 'atom', 'molecule', 'organism', or 'template'",
      });
    }

    if (level === "atom" && composesSpecs && composesSpecs.length > 0) {
      warnings.push({
        path: "composesSpecs",
        message: "Atoms should not compose other component specs — they are primitives",
        suggestion: "Remove composesSpecs or change level to 'molecule'",
      });
    }

    if (level === "molecule") {
      if (!composesSpecs || composesSpecs.length === 0) {
        warnings.push({
          path: "composesSpecs",
          message: "Molecules should compose atom specs",
          suggestion: "Add composesSpecs referencing the atoms this molecule uses",
        });
      }
      if (composesSpecs && composesSpecs.length > 8) {
        warnings.push({
          path: "composesSpecs",
          message: "Molecule composes too many specs — consider splitting into organism",
          suggestion: "Molecules typically compose 2-5 atoms",
        });
      }
    }

    if (level === "organism" && (!composesSpecs || composesSpecs.length === 0)) {
      warnings.push({
        path: "composesSpecs",
        message: "Organisms should compose molecules and/or atoms",
        suggestion: "Add composesSpecs referencing the molecules/atoms this organism uses",
      });
    }

    // Prop explosion check (applicable to all levels)
    const props = comp.props as Record<string, string> | undefined;
    if (props && Object.keys(props).length > 15) {
      warnings.push({
        path: "props",
        message: `Component has ${Object.keys(props).length} props — possible prop explosion`,
        suggestion: "Consider splitting into smaller components at a higher atomic level",
      });
    }

    // Code Connect nudge
    const codeConnect = comp.codeConnect as Record<string, unknown> | undefined;
    if (!codeConnect || !codeConnect.mapped) {
      warnings.push({
        path: "codeConnect",
        message: "No Code Connect mapping established",
        suggestion: "Map this component to its Figma counterpart with codeConnect.figmaNodeId and codeConnect.codebasePath",
      });
    }
  }

  if (raw.type === "dataviz") {
    const dv = raw as Record<string, unknown>;
    if (!dv.sampleData) {
      warnings.push({
        path: "sampleData",
        message: "No sample data provided",
        suggestion: "Add sampleData for accurate preview rendering",
      });
    }
  }

  if (raw.type === "ia") {
    const ia = raw as Record<string, unknown>;
    if (!ia.root || typeof ia.root !== "object") {
      warnings.push({
        path: "root",
        message: "IA spec has no root node",
        suggestion: "Run `memi ia extract` to populate from Figma pages",
      });
    }
    const flows = ia.flows as unknown[] | undefined;
    if (!flows || flows.length === 0) {
      warnings.push({
        path: "flows",
        message: "No navigation flows defined",
        suggestion: "Add flows to describe how users move between pages",
      });
    }
    const entryPoints = ia.entryPoints as string[] | undefined;
    if (!entryPoints || entryPoints.length === 0) {
      warnings.push({
        path: "entryPoints",
        message: "No entry points defined",
        suggestion: "Mark at least one node as an entry point (e.g. home page)",
      });
    }
  }

  if (raw.type === "design") {
    const ds = raw as Record<string, unknown>;
    if (Array.isArray(ds.spacing) && (ds.spacing as unknown[]).length === 0) {
      warnings.push({
        path: "spacing",
        message: "No spacing notes defined",
        suggestion: "Add padding/margin/gap specs for design accuracy",
      });
    }
    if (Array.isArray(ds.interactions) && (ds.interactions as unknown[]).length === 0) {
      warnings.push({
        path: "interactions",
        message: "No interaction notes defined",
        suggestion: "Add hover, click, or transition behaviors",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Cross-reference validation: checks that page specs reference
 * existing component specs, etc.
 */
export async function validateCrossRefs(
  spec: AnySpec,
  registry: Registry
): Promise<ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  if (spec.type === "page") {
    for (const section of spec.sections) {
      const componentSpec = await registry.getSpec(section.component);
      if (!componentSpec) {
        warnings.push({
          path: `sections.${section.name}.component`,
          message: `Component spec "${section.component}" not found`,
          suggestion: `Create it with: memi spec component ${section.component}`,
        });
      }
    }
  }

  if (spec.type === "component" && spec.dataviz) {
    const dvSpec = await registry.getSpec(spec.dataviz);
    if (!dvSpec) {
      warnings.push({
        path: "dataviz",
        message: `DataViz spec "${spec.dataviz}" not found`,
        suggestion: `Create it with: memi dataviz ${spec.dataviz}`,
      });
    }
  }

  // Atomic Design cross-reference: verify composesSpecs exist and respect hierarchy
  if (spec.type === "component" && spec.composesSpecs && spec.composesSpecs.length > 0) {
    const levelOrder = { atom: 0, molecule: 1, organism: 2, template: 3 };
    const currentLevel = levelOrder[spec.level] ?? 0;

    for (const depName of spec.composesSpecs) {
      const depSpec = await registry.getSpec(depName);
      if (!depSpec) {
        warnings.push({
          path: "composesSpecs",
          message: `Composed spec "${depName}" not found`,
          suggestion: `Create it with: memi spec component ${depName}`,
        });
      } else if (depSpec.type === "component") {
        const depLevel = levelOrder[depSpec.level] ?? 0;
        if (depLevel >= currentLevel) {
          warnings.push({
            path: "composesSpecs",
            message: `${spec.level} "${spec.name}" composes ${depSpec.level} "${depName}" — atomic hierarchy violation`,
            suggestion: `A ${spec.level} should only compose lower-level components (atoms < molecules < organisms < templates)`,
          });
        }
      }
    }
  }

  if (spec.type === "design") {
    for (const linked of spec.linkedSpecs) {
      const linkedSpec = await registry.getSpec(linked);
      if (!linkedSpec) {
        warnings.push({
          path: "linkedSpecs",
          message: `Linked spec "${linked}" not found`,
          suggestion: `Create it first or check the name`,
        });
      }
    }
  }

  if (spec.type === "ia") {
    // Validate that linkedPageSpec references exist
    const checkNode = async (node: { linkedPageSpec?: string; children?: unknown[] }, path: string) => {
      if (node.linkedPageSpec) {
        const pageSpec = await registry.getSpec(node.linkedPageSpec);
        if (!pageSpec) {
          warnings.push({
            path: `${path}.linkedPageSpec`,
            message: `Page spec "${node.linkedPageSpec}" not found`,
            suggestion: `Create it with: memi spec page ${node.linkedPageSpec}`,
          });
        }
      }
      const children = node.children as Array<{ linkedPageSpec?: string; children?: unknown[] }> | undefined;
      if (children) {
        for (let i = 0; i < children.length; i++) {
          await checkNode(children[i], `${path}.children[${i}]`);
        }
      }
    };
    await checkNode(spec.root, "root");

    for (const global of spec.globals) {
      if (global.linkedPageSpec) {
        const pageSpec = await registry.getSpec(global.linkedPageSpec);
        if (!pageSpec) {
          warnings.push({
            path: "globals",
            message: `Global nav page spec "${global.linkedPageSpec}" not found`,
            suggestion: `Create it with: memi spec page ${global.linkedPageSpec}`,
          });
        }
      }
    }
  }

  return warnings;
}
