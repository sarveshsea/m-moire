/**
 * Page Generator — Creates full page layouts from Page specs.
 * Uses shadcn layout components (Sidebar, etc.) with responsive design.
 */

import type { PageSpec } from "../specs/types.js";
import type { CodegenContext } from "./generator.js";

interface PageCode {
  page: string;
  barrel: string;
}

const LAYOUT_TEMPLATES: Record<string, { imports: string[]; wrapper: (content: string) => string }> = {
  "sidebar-main": {
    imports: [
      `import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"`,
      `import { AppSidebar } from "@/components/app-sidebar"`,
      `import { Separator } from "@/components/ui/separator"`,
    ],
    wrapper: (content) => [
      "    <SidebarProvider>",
      "      <AppSidebar />",
      "      <SidebarInset>",
      "        <header className=\"flex h-16 shrink-0 items-center gap-2 border-b px-4\">",
      "          <SidebarTrigger className=\"-ml-1\" />",
      "          <Separator orientation=\"vertical\" className=\"mr-2 h-4\" />",
      "          <h1 className=\"text-lg font-semibold\">Page Title</h1>",
      "        </header>",
      "        <main className=\"flex-1 p-6\">",
      content,
      "        </main>",
      "      </SidebarInset>",
      "    </SidebarProvider>",
    ].join("\n"),
  },
  "full-width": {
    imports: [],
    wrapper: (content) => [
      "    <div className=\"min-h-screen\">",
      "      <main className=\"container mx-auto p-6\">",
      content,
      "      </main>",
      "    </div>",
    ].join("\n"),
  },
  "centered": {
    imports: [],
    wrapper: (content) => [
      "    <div className=\"min-h-screen flex items-center justify-center\">",
      "      <div className=\"w-full max-w-4xl p-6\">",
      content,
      "      </div>",
      "    </div>",
    ].join("\n"),
  },
  "dashboard": {
    imports: [
      `import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"`,
      `import { AppSidebar } from "@/components/app-sidebar"`,
    ],
    wrapper: (content) => [
      "    <SidebarProvider>",
      "      <AppSidebar />",
      "      <SidebarInset>",
      "        <main className=\"flex-1 p-6 space-y-6\">",
      content,
      "        </main>",
      "      </SidebarInset>",
      "    </SidebarProvider>",
    ].join("\n"),
  },
  "split": {
    imports: [],
    wrapper: (content) => [
      "    <div className=\"min-h-screen grid grid-cols-2\">",
      content,
      "    </div>",
    ].join("\n"),
  },
  "marketing": {
    imports: [],
    wrapper: (content) => [
      "    <div className=\"min-h-screen\">",
      "      <main className=\"space-y-24\">",
      content,
      "      </main>",
      "    </div>",
    ].join("\n"),
  },
};

export function generatePage(spec: PageSpec, ctx: CodegenContext): PageCode {
  const layout = LAYOUT_TEMPLATES[spec.layout] ?? LAYOUT_TEMPLATES["full-width"];
  const sectionImports = new Set<string>();
  const sectionCode = buildSections(spec, sectionImports);
  const wrappedContent = layout.wrapper(sectionCode);

  const lines: string[] = [];

  // Imports
  lines.push(`import * as React from "react"`);
  lines.push(`import { cn } from "@/lib/utils"`);
  for (const imp of layout.imports) {
    lines.push(imp);
  }
  for (const imp of sectionImports) {
    lines.push(imp);
  }
  lines.push("");

  // Component
  lines.push(`export interface ${spec.name}Props {`);
  lines.push(`  className?: string`);
  lines.push(`}`);
  lines.push("");
  lines.push(`export function ${spec.name}({ className }: ${spec.name}Props) {`);
  lines.push("  return (");
  lines.push(`    <div className={cn("", className)}>`);
  lines.push(wrappedContent);
  lines.push("    </div>");
  lines.push("  )");
  lines.push("}");

  const barrel = [
    `export { ${spec.name} } from "./${spec.name}"`,
    `export type { ${spec.name}Props } from "./${spec.name}"`,
    "",
  ].join("\n");

  return { page: lines.join("\n"), barrel };
}

function buildSections(spec: PageSpec, imports: Set<string>): string {
  if (spec.sections.length === 0) {
    return "          {/* Add sections to your page spec */}";
  }

  const lines: string[] = [];

  for (const section of spec.sections) {
    // Add import for the component
    imports.add(`import { ${section.component} } from "@/generated/components/${section.component}"`);

    const gridClass = layoutToGridClass(section.layout);
    const responsiveClass = buildResponsiveClasses(spec.responsive);

    if (section.repeat > 1) {
      lines.push(`          {/* ${section.name} */}`);
      lines.push(`          <section className="${gridClass} ${responsiveClass}">`);
      for (let i = 0; i < section.repeat; i++) {
        const propsStr = Object.entries(section.props)
          .map(([k, v]) => `${k}={${JSON.stringify(v)}}`)
          .join(" ");
        lines.push(`            <${section.component} ${propsStr} />`);
      }
      lines.push("          </section>");
    } else {
      lines.push(`          {/* ${section.name} */}`);
      const propsStr = Object.entries(section.props)
        .map(([k, v]) => `${k}={${JSON.stringify(v)}}`)
        .join(" ");
      lines.push(`          <section className="${section.layout === "full-width" ? "w-full" : ""}">`);
      lines.push(`            <${section.component} ${propsStr} />`);
      lines.push("          </section>");
    }
  }

  return lines.join("\n");
}

function layoutToGridClass(layout: string): string {
  const map: Record<string, string> = {
    "full-width": "w-full",
    "half": "grid grid-cols-2 gap-4",
    "third": "grid grid-cols-3 gap-4",
    "quarter": "grid grid-cols-4 gap-4",
    "grid-2": "grid grid-cols-2 gap-4",
    "grid-3": "grid grid-cols-3 gap-4",
    "grid-4": "grid grid-cols-4 gap-4",
    "stack": "flex flex-col gap-4",
    "inline": "flex flex-row gap-4",
  };
  return map[layout] ?? "w-full";
}

function buildResponsiveClasses(responsive: PageSpec["responsive"]): string {
  const classes: string[] = [];

  if (responsive.mobile === "stack") {
    classes.push("max-sm:flex max-sm:flex-col");
  }

  if (responsive.tablet.startsWith("grid-")) {
    const cols = responsive.tablet.split("-")[1];
    classes.push(`sm:grid-cols-${cols}`);
  }

  if (responsive.desktop.startsWith("grid-")) {
    const cols = responsive.desktop.split("-")[1];
    classes.push(`lg:grid-cols-${cols}`);
  }

  return classes.join(" ");
}
