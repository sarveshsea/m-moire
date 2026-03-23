/**
 * Screen Composer — Transforms PageSpecs into complete Figma frames.
 *
 * Composes responsive multi-viewport designs (desktop, tablet, mobile)
 * by orchestrating layout logic, component instantiation, and annotations.
 */

import { createLogger } from "../engine/logger.js";
import type { Registry } from "../engine/registry.js";
import type { PageSpec, ComponentSpec } from "../specs/types.js";
import { isComponentSpec, SectionSchema } from "../specs/types.js";
import { z } from "zod";

type Section = z.infer<typeof SectionSchema>;
import type { FigmaBridge } from "./bridge.js";
import type { DevAnnotation } from "./dev-annotations.js";

const log = createLogger("screen-composer");

// ── Figma Node Specification ────────────────────────────────

export interface FigmaNodeSpec {
  id: string;
  name: string;
  type: "FRAME" | "GROUP" | "RECTANGLE" | "TEXT" | "COMPONENT";
  x: number;
  y: number;
  width: number;
  height: number;
  children?: FigmaNodeSpec[];
  fills?: Array<{ type: "SOLID"; color: { r: number; g: number; b: number } }>;
  strokes?: Array<{ type: "SOLID"; color: { r: number; g: number; b: number }; weight: number }>;
  cornerRadius?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  gap?: number;
  layoutMode?: "HORIZONTAL" | "VERTICAL";
  layoutWrap?: boolean;
  counterAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "STRETCH";
  primaryAxisAlignItems?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  primaryAxisSizingMode?: "FIXED" | "AUTO";
  counterAxisSizingMode?: "FIXED" | "AUTO";
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlignHorizontal?: "LEFT" | "CENTER" | "RIGHT";
  textAlignVertical?: "TOP" | "CENTER" | "BOTTOM";
  componentKey?: string;
  componentProps?: Record<string, unknown>;
}

export interface Viewport {
  name: "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
  scale: number; // DPI scale for text sizing
}

export interface ComposedScreen {
  name: string;
  frames: {
    desktop: FigmaNodeSpec;
    tablet: FigmaNodeSpec;
    mobile: FigmaNodeSpec;
  };
  annotations: DevAnnotation[];
  componentMap: Map<string, string>; // figma node name → component spec name
  metadata: {
    pageSpec: PageSpec;
    resolvedComponentSpecs: Map<string, ComponentSpec>;
    generatedAt: string;
  };
}

// ── Viewport Definitions ────────────────────────────────────

const VIEWPORTS: Record<string, Viewport> = {
  desktop: { name: "desktop", width: 1440, height: 900, scale: 1 },
  tablet: { name: "tablet", width: 768, height: 1024, scale: 0.875 },
  mobile: { name: "mobile", width: 375, height: 812, scale: 0.75 },
};

// ── Layout Engine ──────────────────────────────────────────

interface LayoutConfig {
  mode: "HORIZONTAL" | "VERTICAL";
  gapPx: number;
  counterAxisAlignItems: "MIN" | "CENTER" | "MAX" | "STRETCH";
  primaryAxisAlignItems: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisSizingMode: "FIXED" | "AUTO";
}

function getLayoutConfig(layoutType: string): LayoutConfig {
  const configs: Record<string, LayoutConfig> = {
    "sidebar-main": {
      mode: "HORIZONTAL",
      gapPx: 0,
      counterAxisAlignItems: "STRETCH",
      primaryAxisAlignItems: "MIN",
      counterAxisSizingMode: "FIXED",
    },
    "full-width": {
      mode: "VERTICAL",
      gapPx: 24,
      counterAxisAlignItems: "STRETCH",
      primaryAxisAlignItems: "MIN",
      counterAxisSizingMode: "AUTO",
    },
    centered: {
      mode: "VERTICAL",
      gapPx: 24,
      counterAxisAlignItems: "CENTER",
      primaryAxisAlignItems: "MIN",
      counterAxisSizingMode: "AUTO",
    },
    split: {
      mode: "HORIZONTAL",
      gapPx: 0,
      counterAxisAlignItems: "STRETCH",
      primaryAxisAlignItems: "MIN",
      counterAxisSizingMode: "AUTO",
    },
    dashboard: {
      mode: "VERTICAL",
      gapPx: 24,
      counterAxisAlignItems: "STRETCH",
      primaryAxisAlignItems: "MIN",
      counterAxisSizingMode: "AUTO",
    },
    marketing: {
      mode: "VERTICAL",
      gapPx: 96,
      counterAxisAlignItems: "STRETCH",
      primaryAxisAlignItems: "MIN",
      counterAxisSizingMode: "AUTO",
    },
  };

  return configs[layoutType] ?? configs["full-width"];
}

// ── Screen Composer ────────────────────────────────────────

export class ScreenComposer {
  private log = log;

  constructor(private registry: Registry) {}

  /**
   * Compose a PageSpec into a full multi-viewport design.
   */
  async compose(pageSpec: PageSpec): Promise<ComposedScreen> {
    this.log.info(`Composing page: ${pageSpec.name}`);

    // Resolve all component specs referenced in the page
    const resolvedComponentSpecs = await this.resolveComponentSpecs(pageSpec);
    if (resolvedComponentSpecs.size === 0) {
      this.log.warn(`No component specs found for page ${pageSpec.name}`);
    }

    // Build frames for each viewport
    const frames = {
      desktop: this.buildFrame(pageSpec, VIEWPORTS.desktop, resolvedComponentSpecs),
      tablet: this.buildFrame(pageSpec, VIEWPORTS.tablet, resolvedComponentSpecs),
      mobile: this.buildFrame(pageSpec, VIEWPORTS.mobile, resolvedComponentSpecs),
    };

    // Build component map for annotations
    const componentMap = new Map<string, string>();
    resolvedComponentSpecs.forEach((_, specName) => {
      componentMap.set(specName, specName);
    });

    return {
      name: pageSpec.name,
      frames,
      annotations: [], // Will be populated by DevAnnotator
      componentMap,
      metadata: {
        pageSpec,
        resolvedComponentSpecs,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Compose a PageSpec and push all frames to Figma via the bridge.
   */
  async composeAndPush(pageSpec: PageSpec, bridge: FigmaBridge): Promise<void> {
    const screen = await this.compose(pageSpec);

    // Generate Figma plugin commands to create the frames
    const commands = this.generateFigmaCommands(screen);

    this.log.info(`Pushing ${commands.length} commands to Figma for page: ${pageSpec.name}`);
    for (const command of commands) {
      await bridge.execute(command, 30000);
    }

    this.log.info(`Successfully pushed page: ${pageSpec.name}`);
  }

  // ── Private Methods ────────────────────────────────────

  /**
   * Resolve all ComponentSpecs referenced in a PageSpec.
   */
  private async resolveComponentSpecs(pageSpec: PageSpec): Promise<Map<string, ComponentSpec>> {
    const resolved = new Map<string, ComponentSpec>();

    for (const section of pageSpec.sections ?? []) {
      const spec = await this.registry.getSpec(section.component);
      if (spec && isComponentSpec(spec)) {
        resolved.set(section.component, spec);
      } else {
        this.log.warn(`Component spec not found for section: ${section.component}`);
      }
    }

    return resolved;
  }

  /**
   * Build a complete frame for a given viewport.
   */
  private buildFrame(
    pageSpec: PageSpec,
    viewport: Viewport,
    resolvedComponentSpecs: Map<string, ComponentSpec>
  ): FigmaNodeSpec {
    const layoutConfig = getLayoutConfig(pageSpec.layout);
    const frameId = `frame_${pageSpec.name}_${viewport.name}`;

    const children: FigmaNodeSpec[] = [];

    // Add page chrome based on layout
    if (["sidebar-main", "dashboard"].includes(pageSpec.layout)) {
      const sidebarFrame = this.buildSidebar(viewport);
      const mainContent = this.buildMainContent(
        pageSpec,
        viewport,
        layoutConfig,
        resolvedComponentSpecs
      );
      children.push(sidebarFrame);
      children.push(mainContent);
    } else {
      const mainContent = this.buildMainContent(
        pageSpec,
        viewport,
        layoutConfig,
        resolvedComponentSpecs
      );
      children.push(mainContent);
    }

    return {
      id: frameId,
      name: `${pageSpec.name} / ${viewport.name}`,
      type: "FRAME",
      x: 0,
      y: 0,
      width: viewport.width,
      height: viewport.height,
      layoutMode: layoutConfig.mode,
      gap: layoutConfig.gapPx,
      counterAxisAlignItems: layoutConfig.counterAxisAlignItems,
      primaryAxisAlignItems: layoutConfig.primaryAxisAlignItems,
      counterAxisSizingMode: layoutConfig.counterAxisSizingMode,
      primaryAxisSizingMode: "AUTO",
      children,
      fills: [{ type: "SOLID" as const, color: { r: 1, g: 1, b: 1 } }],
    };
  }

  /**
   * Build a sidebar frame for sidebar-based layouts.
   */
  private buildSidebar(viewport: Viewport): FigmaNodeSpec {
    return {
      id: `sidebar_${viewport.name}`,
      name: "Sidebar",
      type: "FRAME",
      x: 0,
      y: 0,
      width: Math.min(280, viewport.width * 0.2),
      height: viewport.height,
      layoutMode: "VERTICAL",
      gap: 16,
      counterAxisAlignItems: "STRETCH",
      primaryAxisAlignItems: "MIN",
      children: [
        this.createTextNode("Nav Item 1", 280, 48, 16),
        this.createTextNode("Nav Item 2", 280, 48, 16),
        this.createTextNode("Nav Item 3", 280, 48, 16),
      ],
      fills: [{ type: "SOLID" as const, color: { r: 0.95, g: 0.95, b: 0.95 } }],
    };
  }

  /**
   * Build the main content area with sections.
   */
  private buildMainContent(
    pageSpec: PageSpec,
    viewport: Viewport,
    layoutConfig: LayoutConfig,
    resolvedComponentSpecs: Map<string, ComponentSpec>
  ): FigmaNodeSpec {
    const contentWidth =
      ["sidebar-main", "dashboard"].includes(pageSpec.layout)
        ? viewport.width - 280
        : viewport.width;

    const children: FigmaNodeSpec[] = [];

    // Add header for sidebar layouts
    if (["sidebar-main", "dashboard"].includes(pageSpec.layout)) {
      children.push(this.buildHeader(contentWidth, viewport));
    }

    // Render sections
    for (const section of pageSpec.sections ?? []) {
      const sectionNode = this.renderSection(section, viewport, resolvedComponentSpecs);
      if (sectionNode) {
        children.push(sectionNode);
      }
    }

    return {
      id: `main_content_${viewport.name}`,
      name: "Main Content",
      type: "FRAME",
      x: ["sidebar-main", "dashboard"].includes(pageSpec.layout) ? 280 : 0,
      y: 0,
      width: contentWidth,
      height: viewport.height,
      layoutMode: layoutConfig.mode,
      gap: layoutConfig.gapPx,
      counterAxisAlignItems: layoutConfig.counterAxisAlignItems,
      primaryAxisAlignItems: layoutConfig.primaryAxisAlignItems,
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "AUTO",
      children,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
    };
  }

  /**
   * Build a header frame for pages with sidebars.
   */
  private buildHeader(width: number, viewport: Viewport): FigmaNodeSpec {
    return {
      id: `header_${viewport.name}`,
      name: "Header",
      type: "FRAME",
      x: 0,
      y: 0,
      width,
      height: 64,
      layoutMode: "HORIZONTAL",
      counterAxisAlignItems: "CENTER",
      primaryAxisAlignItems: "MIN",
      gap: 16,
      children: [this.createTextNode("Page Title", width - 32, 48, 20)],
      fills: [{ type: "SOLID" as const, color: { r: 1, g: 1, b: 1 } }],
      strokes: [{ type: "SOLID" as const, color: { r: 0.9, g: 0.9, b: 0.9 }, weight: 1 }],
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
    };
  }

  /**
   * Render a section with proper layout and repeated components.
   */
  private renderSection(
    section: Section,
    viewport: Viewport,
    resolvedComponentSpecs: Map<string, ComponentSpec>
  ): FigmaNodeSpec | null {
    const componentSpec = resolvedComponentSpecs.get(section.component);
    if (!componentSpec) {
      this.log.warn(`Component spec not found: ${section.component}`);
      return null;
    }

    const children: FigmaNodeSpec[] = [];

    // Create repeated component instances
    for (let i = 0; i < section.repeat; i++) {
      const componentNode = this.createComponentInstance(
        componentSpec,
        section.props,
        viewport,
        i
      );
      children.push(componentNode);
    }

    // Apply section layout
    const layoutConfig = this.getSectionLayoutConfig(section.layout, viewport);

    return {
      id: `section_${section.name}`,
      name: section.name,
      type: "FRAME",
      x: 0,
      y: 0,
      width: viewport.width,
      height: "auto" as any, // Will auto-size based on children
      layoutMode: layoutConfig.mode,
      gap: layoutConfig.gapPx,
      counterAxisAlignItems: layoutConfig.counterAxisAlignItems,
      primaryAxisAlignItems: layoutConfig.primaryAxisAlignItems,
      primaryAxisSizingMode: "AUTO",
      counterAxisSizingMode: "AUTO",
      children,
    };
  }

  /**
   * Create a component instance frame.
   */
  private createComponentInstance(
    componentSpec: ComponentSpec,
    props: Record<string, unknown>,
    viewport: Viewport,
    index: number
  ): FigmaNodeSpec {
    const componentWidth = Math.min(300, viewport.width - 32);
    const componentHeight = 200;

    const propText = Object.entries(props)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join("\n");

    return {
      id: `component_${componentSpec.name}_${index}`,
      name: `${componentSpec.name} ${index + 1}`,
      type: "COMPONENT",
      x: 0,
      y: 0,
      width: componentWidth,
      height: componentHeight,
      componentKey: componentSpec.name,
      componentProps: props,
      children: [
        this.createTextNode(
          `<${componentSpec.name} ${propText} />`,
          componentWidth - 16,
          componentHeight - 32,
          12,
          "monospace"
        ),
      ],
      fills: [{ type: "SOLID" as const, color: { r: 0.98, g: 0.98, b: 1 } }],
      strokes: [{ type: "SOLID" as const, color: { r: 0.5, g: 0.5, b: 1 }, weight: 1 }],
      cornerRadius: 8,
      paddingTop: 16,
      paddingRight: 16,
      paddingBottom: 16,
      paddingLeft: 16,
    };
  }

  /**
   * Get layout config for a section layout type.
   */
  private getSectionLayoutConfig(layoutType: string, viewport: Viewport): LayoutConfig {
    const configs: Record<string, LayoutConfig> = {
      "full-width": {
        mode: "VERTICAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "AUTO",
      },
      stack: {
        mode: "VERTICAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "AUTO",
      },
      inline: {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "CENTER",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "AUTO",
      },
      "grid-2": {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "FIXED",
      },
      "grid-3": {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "FIXED",
      },
      "grid-4": {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "FIXED",
      },
      half: {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "AUTO",
      },
      third: {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "AUTO",
      },
      quarter: {
        mode: "HORIZONTAL",
        gapPx: 16,
        counterAxisAlignItems: "STRETCH",
        primaryAxisAlignItems: "MIN",
        counterAxisSizingMode: "AUTO",
      },
    };

    return configs[layoutType] ?? configs["full-width"];
  }

  /**
   * Create a text node.
   */
  private createTextNode(
    text: string,
    width: number,
    height: number,
    fontSize: number,
    fontFamily: string = "Inter"
  ): FigmaNodeSpec {
    return {
      id: `text_${text.slice(0, 20).replace(/\s+/g, "_")}`,
      name: text,
      type: "TEXT",
      x: 0,
      y: 0,
      width,
      height,
      text,
      fontSize,
      fontFamily,
      fontWeight: 400,
      lineHeight: fontSize * 1.5,
      letterSpacing: 0,
      textAlignHorizontal: "LEFT",
      textAlignVertical: "CENTER",
    };
  }

  /**
   * Generate Figma plugin commands from a composed screen.
   */
  private generateFigmaCommands(screen: ComposedScreen): string[] {
    const commands: string[] = [];

    // Create desktop frame
    commands.push(this.frameToFigmaCode(screen.frames.desktop));

    // Create tablet frame (offset to the right)
    const tabletFrame = { ...screen.frames.tablet, x: 1500, y: 0 };
    commands.push(this.frameToFigmaCode(tabletFrame));

    // Create mobile frame (offset further right)
    const mobileFrame = { ...screen.frames.mobile, x: 2350, y: 0 };
    commands.push(this.frameToFigmaCode(mobileFrame));

    return commands;
  }

  /**
   * Convert a FigmaNodeSpec to Figma plugin code.
   */
  private frameToFigmaCode(node: FigmaNodeSpec): string {
    // This is a simplified version that generates JavaScript for the Figma plugin
    const createNode = (n: FigmaNodeSpec, depth = 0): string => {
      const indent = "  ".repeat(depth);

      if (n.type === "TEXT") {
        return `
${indent}const text = figma.createText();
${indent}text.characters = "${n.text || ""}";
${indent}text.x = ${n.x};
${indent}text.y = ${n.y};
${indent}text.width = ${n.width};
${indent}text.height = ${n.height};
${indent}text.fontSize = ${n.fontSize || 12};
${indent}parent.appendChild(text);
`;
      }

      if (n.type === "FRAME" || n.type === "GROUP") {
        let code = `
${indent}const ${n.type.toLowerCase()} = figma.createFrame();
${indent}${n.type.toLowerCase()}.name = "${n.name}";
${indent}${n.type.toLowerCase()}.x = ${n.x};
${indent}${n.type.toLowerCase()}.y = ${n.y};
${indent}${n.type.toLowerCase()}.width = ${n.width};
${indent}${n.type.toLowerCase()}.height = ${n.height};
${indent}parent.appendChild(${n.type.toLowerCase()});
`;

        if (n.layoutMode) {
          code += `${indent}${n.type.toLowerCase()}.layoutMode = "${n.layoutMode}";\n`;
        }
        if (n.gap !== undefined) {
          code += `${indent}${n.type.toLowerCase()}.itemSpacing = ${n.gap};\n`;
        }

        if (n.children) {
          for (const child of n.children) {
            code += createNode(child, depth + 1);
          }
        }

        return code;
      }

      return "";
    };

    return `
(function() {
  const page = figma.currentPage;
  let parent = page;

${createNode(node, 1)}

  figma.notify("Frame created: ${node.name}");
})();
`;
  }
}

export default ScreenComposer;
