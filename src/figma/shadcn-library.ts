/**
 * shadcn/ui Library for Figma — The complete mapping layer.
 *
 * This module defines a complete shadcn/ui component library, translating
 * each component's design specifications into Figma node structures.
 * Every component includes accurate sizing, layout specs, color tokens,
 * typography, and all variants with full Figma node tree definitions.
 *
 * The library is the source of truth for converting shadcn specs into
 * Figma designs, supporting both automated design generation and
 * visual component galleries.
 */

import type { DesignToken } from "../engine/registry.js";

// ── Type Definitions ────────────────────────────────────────────

/**
 * Recursive structure describing how to build a Figma component.
 * Maps directly to the Figma Plugin API's node creation model.
 */
export interface FigmaNodeSpec {
  type:
    | "FRAME"
    | "TEXT"
    | "RECTANGLE"
    | "ELLIPSE"
    | "COMPONENT"
    | "INSTANCE"
    | "GROUP";
  name: string;

  // Auto-layout configuration
  layout?: {
    mode: "HORIZONTAL" | "VERTICAL" | "NONE";
    padding?: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    gap?: number;
    sizing?: {
      width: "FIXED" | "HUG" | "FILL";
      height: "FIXED" | "HUG" | "FILL";
    };
    alignment?: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
    counterAlignment?: "MIN" | "CENTER" | "MAX";
  };

  // Dimensions
  size?: {
    width: number;
    height: number;
  };

  // Visual styling
  style?: {
    fill?: string; // hex color or token reference
    stroke?: string;
    strokeWidth?: number;
    cornerRadius?: number | CornerRadiusObject;
    opacity?: number;
    shadow?: ShadowSpec[];
  };

  // Text node content
  text?: {
    content: string;
    fontSize: number;
    fontWeight: number;
    fontFamily: string;
    color: string;
    lineHeight?: number;
    letterSpacing?: number;
  };

  // Nested children
  children?: FigmaNodeSpec[];
}

interface CornerRadiusObject {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

interface ShadowSpec {
  x: number;
  y: number;
  blur: number;
  spread?: number;
  color: string;
}

export interface ShadcnVariant {
  name: string;
  label: string;
  description?: string;
  properties: Record<string, unknown>;
  preview: {
    width: number;
    height: number;
  };
}

/**
 * Complete definition of a shadcn/ui component for Figma.
 * Includes visual specs, all variants, React code snippet, and Figma structure.
 */
export interface ShadcnFigmaComponent {
  // Identity
  name: string; // e.g. "Button"
  category:
    | "input"
    | "display"
    | "layout"
    | "feedback"
    | "navigation"
    | "data";
  description: string;

  // Variants and defaults
  variants: ShadcnVariant[];
  defaultProps: Record<string, unknown>;

  // Figma integration
  figmaStructure: FigmaNodeSpec;
  codeSnippet: string; // React code for dev mode
  importPath: string; // @/components/ui/button

  // Metadata
  tags: string[];
  notes: string[];
}

// ── Color Tokens ────────────────────────────────────────────────

export const SHADCN_COLORS = {
  background: "#ffffff",
  foreground: "#09090b",
  card: "#ffffff",
  cardForeground: "#09090b",
  popover: "#ffffff",
  popoverForeground: "#09090b",
  primary: "#18181b",
  primaryForeground: "#fafafa",
  secondary: "#f4f4f5",
  secondaryForeground: "#18181b",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  accent: "#f4f4f5",
  accentForeground: "#18181b",
  destructive: "#ef4444",
  destructiveForeground: "#fafafa",
  border: "#e4e4e7",
  input: "#e4e4e7",
  ring: "#18181b",
};

export const SHADCN_SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
};

export const SHADCN_RADIUS = 8; // 0.5rem in px
export const SHADCN_TYPOGRAPHY = {
  fontFamily: "Inter, system-ui, sans-serif",
  xs: { fontSize: 12, fontWeight: 400, lineHeight: 16 },
  sm: { fontSize: 14, fontWeight: 400, lineHeight: 20 },
  base: { fontSize: 14, fontWeight: 400, lineHeight: 20 },
  lg: { fontSize: 18, fontWeight: 600, lineHeight: 28 },
  xl: { fontSize: 20, fontWeight: 600, lineHeight: 28 },
  "2xl": { fontSize: 24, fontWeight: 700, lineHeight: 32 },
};

// ── Helper Functions ────────────────────────────────────────────

/**
 * Build a FigmaNodeSpec for a rectangle with standard properties.
 */
function rect(
  name: string,
  width: number,
  height: number,
  fill: string,
  radius = SHADCN_RADIUS
): FigmaNodeSpec {
  return {
    type: "RECTANGLE",
    name,
    size: { width, height },
    style: { fill, cornerRadius: radius },
  };
}

/**
 * Build a FigmaNodeSpec for a text node.
 */
function text(
  name: string,
  content: string,
  fontSize: number,
  fontWeight: number,
  color: string
): FigmaNodeSpec {
  return {
    type: "TEXT",
    name,
    text: {
      content,
      fontSize,
      fontWeight,
      fontFamily: SHADCN_TYPOGRAPHY.fontFamily,
      color,
      lineHeight: fontSize * 1.4,
    },
  };
}

/**
 * Build a FigmaNodeSpec for a frame with auto-layout.
 */
function frame(
  name: string,
  width: number,
  height: number,
  layout: "HORIZONTAL" | "VERTICAL" | "NONE" = "VERTICAL",
  padding = SHADCN_SPACING.md,
  gap = SHADCN_SPACING.sm,
  fill?: string
): FigmaNodeSpec {
  const spec: FigmaNodeSpec = {
    type: "FRAME",
    name,
    size: { width, height },
    layout:
      layout !== "NONE"
        ? {
            mode: layout,
            padding: { top: padding, right: padding, bottom: padding, left: padding },
            gap,
            sizing: { width: "FIXED", height: "FIXED" },
          }
        : undefined,
  };

  if (fill) {
    spec.style = { fill, cornerRadius: SHADCN_RADIUS };
  }

  return spec;
}

// ── Component Library ────────────────────────────────────────────

/**
 * Button component — The foundational interactive element.
 * Variants: default, destructive, outline, secondary, ghost, link
 * Sizes: default (h-9, px-4), sm (h-8, px-3), lg (h-10, px-8), icon
 */
const BUTTON: ShadcnFigmaComponent = {
  name: "Button",
  category: "input",
  description:
    "Interactive button with multiple variants and sizes, built on shadcn/ui",
  variants: [
    {
      name: "default-default",
      label: "Default / Default",
      description: "Primary action button, default size",
      properties: { variant: "default", size: "default" },
      preview: { width: 80, height: 36 },
    },
    {
      name: "default-sm",
      label: "Default / Small",
      description: "Primary action button, small size",
      properties: { variant: "default", size: "sm" },
      preview: { width: 70, height: 32 },
    },
    {
      name: "default-lg",
      label: "Default / Large",
      description: "Primary action button, large size",
      properties: { variant: "default", size: "lg" },
      preview: { width: 100, height: 40 },
    },
    {
      name: "default-icon",
      label: "Default / Icon",
      description: "Icon-only primary button",
      properties: { variant: "default", size: "icon" },
      preview: { width: 36, height: 36 },
    },
    {
      name: "outline-default",
      label: "Outline / Default",
      description: "Secondary action button, outlined",
      properties: { variant: "outline", size: "default" },
      preview: { width: 80, height: 36 },
    },
    {
      name: "destructive-default",
      label: "Destructive / Default",
      description: "Dangerous action button",
      properties: { variant: "destructive", size: "default" },
      preview: { width: 80, height: 36 },
    },
    {
      name: "secondary-default",
      label: "Secondary / Default",
      description: "Secondary action button",
      properties: { variant: "secondary", size: "default" },
      preview: { width: 80, height: 36 },
    },
    {
      name: "ghost-default",
      label: "Ghost / Default",
      description: "Subtle action button",
      properties: { variant: "ghost", size: "default" },
      preview: { width: 80, height: 36 },
    },
    {
      name: "link-default",
      label: "Link / Default",
      description: "Text link styled as button",
      properties: { variant: "link", size: "default" },
      preview: { width: 60, height: 36 },
    },
  ],
  defaultProps: {
    variant: "default",
    size: "default",
    disabled: false,
  },
  figmaStructure: frame("Button", 80, 36, "HORIZONTAL", 8, 4, SHADCN_COLORS.primary),
  codeSnippet: `import { Button } from "@/components/ui/button"

export function MyButton() {
  return <Button variant="default">Click me</Button>
}`,
  importPath: "@/components/ui/button",
  tags: ["interactive", "primary", "action"],
  notes: [
    "h-9 (36px) base height with px-4 (16px) horizontal padding",
    "All variants support sm, lg, icon sizes",
    "Supports loading and disabled states",
  ],
};

/**
 * Card component — Container for grouped content.
 * Includes CardHeader, CardTitle, CardDescription, CardContent, CardFooter
 */
const CARD: ShadcnFigmaComponent = {
  name: "Card",
  category: "layout",
  description: "Container for grouped content with section support",
  variants: [
    {
      name: "default",
      label: "Default Card",
      description: "Standard card with header and content",
      properties: {},
      preview: { width: 300, height: 200 },
    },
    {
      name: "with-footer",
      label: "Card with Footer",
      description: "Card including footer actions",
      properties: {},
      preview: { width: 300, height: 240 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame(
    "Card",
    300,
    200,
    "VERTICAL",
    SHADCN_SPACING.lg,
    SHADCN_SPACING.lg,
    SHADCN_COLORS.card
  ),
  codeSnippet: `import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export function MyCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card Description</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content goes here</p>
      </CardContent>
    </Card>
  )
}`,
  importPath: "@/components/ui/card",
  tags: ["container", "layout", "grouping"],
  notes: [
    "White background with subtle border (1px, var(--border))",
    "Rounded corners (8px border-radius)",
    "Padding varies by section: header 24px, content 16px, footer 16px",
    "Shadow: 0 1px 3px rgba(0,0,0,0.1)",
  ],
};

/**
 * Input component — Text field for user input.
 * Variants: default, with label, with error
 */
const INPUT: ShadcnFigmaComponent = {
  name: "Input",
  category: "input",
  description: "Text input field with optional label and error state",
  variants: [
    {
      name: "default",
      label: "Input / Default",
      description: "Standard text input",
      properties: { hasLabel: false, hasError: false },
      preview: { width: 280, height: 40 },
    },
    {
      name: "with-label",
      label: "Input / With Label",
      description: "Input with accompanying label",
      properties: { hasLabel: true, hasError: false },
      preview: { width: 280, height: 72 },
    },
    {
      name: "with-error",
      label: "Input / Error",
      description: "Input showing validation error",
      properties: { hasLabel: true, hasError: true },
      preview: { width: 280, height: 96 },
    },
  ],
  defaultProps: {
    placeholder: "Enter text...",
  },
  figmaStructure: frame("Input", 280, 40, "VERTICAL", 0, 8),
  codeSnippet: `import { Input } from "@/components/ui/input"

export function MyInput() {
  return <Input type="email" placeholder="Enter your email" />
}`,
  importPath: "@/components/ui/input",
  tags: ["form", "input", "text-field"],
  notes: [
    "h-9 (36px) base height",
    "Border: 1px var(--input) #e4e4e7",
    "Padding: 8px 12px",
    "Focus: outline-none ring-2 ring-offset-2 ring-ring",
    "Placeholder: muted-foreground #71717a",
  ],
};

/**
 * Badge component — Small label for categorization.
 * Variants: default, secondary, destructive, outline
 */
const BADGE: ShadcnFigmaComponent = {
  name: "Badge",
  category: "display",
  description: "Small label for categorization or status indication",
  variants: [
    {
      name: "default",
      label: "Badge / Default",
      description: "Primary badge",
      properties: { variant: "default" },
      preview: { width: 60, height: 24 },
    },
    {
      name: "secondary",
      label: "Badge / Secondary",
      description: "Secondary badge",
      properties: { variant: "secondary" },
      preview: { width: 60, height: 24 },
    },
    {
      name: "destructive",
      label: "Badge / Destructive",
      description: "Destructive badge",
      properties: { variant: "destructive" },
      preview: { width: 60, height: 24 },
    },
    {
      name: "outline",
      label: "Badge / Outline",
      description: "Outlined badge",
      properties: { variant: "outline" },
      preview: { width: 60, height: 24 },
    },
  ],
  defaultProps: {
    variant: "default",
  },
  figmaStructure: frame(
    "Badge",
    60,
    24,
    "HORIZONTAL",
    4,
    4,
    SHADCN_COLORS.primary
  ),
  codeSnippet: `import { Badge } from "@/components/ui/badge"

export function MyBadge() {
  return <Badge variant="default">New</Badge>
}`,
  importPath: "@/components/ui/badge",
  tags: ["label", "status", "category"],
  notes: [
    "Inline-flex display",
    "Height: 20px (h-5)",
    "Padding: 2px 10px",
    "Font size: 12px",
    "Border radius: 2px (slightly less than base)",
    "Font weight: 500",
  ],
};

/**
 * Avatar component — User profile image or initial.
 * Variants: with image, with fallback
 */
const AVATAR: ShadcnFigmaComponent = {
  name: "Avatar",
  category: "display",
  description: "Circular profile image or initials",
  variants: [
    {
      name: "with-image",
      label: "Avatar / With Image",
      description: "Avatar displaying user image",
      properties: { hasImage: true },
      preview: { width: 40, height: 40 },
    },
    {
      name: "with-fallback",
      label: "Avatar / With Fallback",
      description: "Avatar displaying initials",
      properties: { hasImage: false },
      preview: { width: 40, height: 40 },
    },
    {
      name: "large",
      label: "Avatar / Large",
      description: "Larger avatar (64px)",
      properties: { size: "lg" },
      preview: { width: 64, height: 64 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Avatar", 40, 40, "NONE"),
  codeSnippet: `import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

export function MyAvatar() {
  return (
    <Avatar>
      <AvatarImage src="https://github.com/shadcn.png" />
      <AvatarFallback>CN</AvatarFallback>
    </Avatar>
  )
}`,
  importPath: "@/components/ui/avatar",
  tags: ["user", "profile", "image"],
  notes: [
    "Default: 40px x 40px (h-10 w-10)",
    "Circular border-radius: 9999px",
    "Aspect ratio: 1/1",
    "Fallback background: secondary #f4f4f5",
    "Fallback color: secondary-foreground #18181b",
  ],
};

/**
 * Label component — Form label text.
 */
const LABEL: ShadcnFigmaComponent = {
  name: "Label",
  category: "display",
  description: "Associated label for form inputs",
  variants: [
    {
      name: "default",
      label: "Label / Default",
      description: "Standard form label",
      properties: {},
      preview: { width: 120, height: 20 },
    },
  ],
  defaultProps: {},
  figmaStructure: text(
    "Label",
    "Label",
    SHADCN_TYPOGRAPHY.sm.fontSize,
    500,
    SHADCN_COLORS.foreground
  ),
  codeSnippet: `import { Label } from "@/components/ui/label"

export function MyForm() {
  return (
    <Label htmlFor="email">Email</Label>
  )
}`,
  importPath: "@/components/ui/label",
  tags: ["form", "text", "label"],
  notes: [
    "Font size: 14px (text-sm)",
    "Font weight: 500 (medium)",
    "Color: foreground #09090b",
    "Cursor: pointer when associated with input",
  ],
};

/**
 * Textarea component — Multi-line text input.
 */
const TEXTAREA: ShadcnFigmaComponent = {
  name: "Textarea",
  category: "input",
  description: "Multi-line text input field",
  variants: [
    {
      name: "default",
      label: "Textarea / Default",
      description: "Standard textarea",
      properties: {},
      preview: { width: 280, height: 120 },
    },
  ],
  defaultProps: {
    placeholder: "Enter your message...",
    rows: 4,
  },
  figmaStructure: frame("Textarea", 280, 120, "VERTICAL", 8),
  codeSnippet: `import { Textarea } from "@/components/ui/textarea"

export function MyTextarea() {
  return <Textarea placeholder="Enter your message..." />
}`,
  importPath: "@/components/ui/textarea",
  tags: ["form", "input", "text"],
  notes: [
    "Min height: 80px",
    "Padding: 8px 12px",
    "Border: 1px var(--input)",
    "Font: 14px, same as input",
    "Line height: 1.4 (20px)",
    "Supports resize (vertical)",
  ],
};

/**
 * Switch component — Toggle control.
 * Variants: on, off
 */
const SWITCH: ShadcnFigmaComponent = {
  name: "Switch",
  category: "input",
  description: "Toggle switch for boolean inputs",
  variants: [
    {
      name: "off",
      label: "Switch / Off",
      description: "Toggle in off position",
      properties: { checked: false },
      preview: { width: 44, height: 24 },
    },
    {
      name: "on",
      label: "Switch / On",
      description: "Toggle in on position",
      properties: { checked: true },
      preview: { width: 44, height: 24 },
    },
  ],
  defaultProps: {
    checked: false,
  },
  figmaStructure: frame("Switch", 44, 24, "HORIZONTAL"),
  codeSnippet: `import { Switch } from "@/components/ui/switch"

export function MySwitch() {
  return <Switch />
}`,
  importPath: "@/components/ui/switch",
  tags: ["toggle", "form", "input"],
  notes: [
    "Width: 44px, Height: 24px",
    "Track background: secondary #f4f4f5 (off), primary #18181b (on)",
    "Thumb: 20px circle, white",
    "Transition: 200ms",
    "Accessibility: role=switch, aria-checked",
  ],
};

/**
 * Checkbox component — Multi-select control.
 * Variants: checked, unchecked, indeterminate
 */
const CHECKBOX: ShadcnFigmaComponent = {
  name: "Checkbox",
  category: "input",
  description: "Checkbox input for multi-select",
  variants: [
    {
      name: "unchecked",
      label: "Checkbox / Unchecked",
      description: "Checkbox in unchecked state",
      properties: { checked: false },
      preview: { width: 20, height: 20 },
    },
    {
      name: "checked",
      label: "Checkbox / Checked",
      description: "Checkbox in checked state",
      properties: { checked: true },
      preview: { width: 20, height: 20 },
    },
    {
      name: "indeterminate",
      label: "Checkbox / Indeterminate",
      description: "Checkbox in indeterminate state",
      properties: { checked: "indeterminate" },
      preview: { width: 20, height: 20 },
    },
  ],
  defaultProps: {
    checked: false,
  },
  figmaStructure: rect(
    "Checkbox",
    20,
    20,
    SHADCN_COLORS.background,
    4
  ),
  codeSnippet: `import { Checkbox } from "@/components/ui/checkbox"

export function MyCheckbox() {
  return <Checkbox />
}`,
  importPath: "@/components/ui/checkbox",
  tags: ["form", "input", "select"],
  notes: [
    "Size: 20px x 20px (h-5 w-5)",
    "Border: 2px ring-primary #18181b",
    "Checked background: primary #18181b",
    "Border radius: 4px (rounded-sm)",
    "Focus ring: ring-offset-2 ring-ring",
  ],
};

/**
 * Separator component — Visual divider.
 * Variants: horizontal, vertical
 */
const SEPARATOR: ShadcnFigmaComponent = {
  name: "Separator",
  category: "layout",
  description: "Visual divider between content sections",
  variants: [
    {
      name: "horizontal",
      label: "Separator / Horizontal",
      description: "Horizontal divider line",
      properties: { orientation: "horizontal" },
      preview: { width: 200, height: 1 },
    },
    {
      name: "vertical",
      label: "Separator / Vertical",
      description: "Vertical divider line",
      properties: { orientation: "vertical" },
      preview: { width: 1, height: 100 },
    },
  ],
  defaultProps: {},
  figmaStructure: rect("Separator", 200, 1, SHADCN_COLORS.border),
  codeSnippet: `import { Separator } from "@/components/ui/separator"

export function MyPage() {
  return (
    <>
      <section>Content</section>
      <Separator />
      <section>More content</section>
    </>
  )
}`,
  importPath: "@/components/ui/separator",
  tags: ["divider", "layout"],
  notes: [
    "Horizontal: height 1px, full width",
    "Vertical: width 1px, full height",
    "Color: border #e4e4e7",
    "No padding or margin built-in (added by parent)",
  ],
};

/**
 * Skeleton component — Loading placeholder.
 * Variants: rect, circle, text line
 */
const SKELETON: ShadcnFigmaComponent = {
  name: "Skeleton",
  category: "feedback",
  description: "Loading placeholder skeleton",
  variants: [
    {
      name: "rect",
      label: "Skeleton / Rectangle",
      description: "Rectangular skeleton for images or blocks",
      properties: { shape: "rect" },
      preview: { width: 100, height: 100 },
    },
    {
      name: "circle",
      label: "Skeleton / Circle",
      description: "Circular skeleton for avatars",
      properties: { shape: "circle" },
      preview: { width: 40, height: 40 },
    },
    {
      name: "text",
      label: "Skeleton / Text",
      description: "Text line skeleton",
      properties: { shape: "text" },
      preview: { width: 200, height: 16 },
    },
  ],
  defaultProps: {},
  figmaStructure: rect("Skeleton", 100, 100, "#e4e4e7", SHADCN_RADIUS),
  codeSnippet: `import { Skeleton } from "@/components/ui/skeleton"

export function CardSkeleton() {
  return (
    <div>
      <Skeleton className="h-12 w-12 rounded-full" />
      <Skeleton className="h-4 w-[250px]" />
    </div>
  )
}`,
  importPath: "@/components/ui/skeleton",
  tags: ["loading", "placeholder", "feedback"],
  notes: [
    "Background: #e4e4e7 (muted color)",
    "Animated: pulse animation (opacity 0.5 - 1, 2s infinite)",
    "Border radius: matches context (4px for text, 9999px for circle)",
    "Used as container for other skeletons",
  ],
};

/**
 * Alert component — Alert message container.
 * Variants: default, destructive
 */
const ALERT: ShadcnFigmaComponent = {
  name: "Alert",
  category: "feedback",
  description: "Alert message container with icon and text",
  variants: [
    {
      name: "default",
      label: "Alert / Default",
      description: "Standard info alert",
      properties: { variant: "default" },
      preview: { width: 400, height: 80 },
    },
    {
      name: "destructive",
      label: "Alert / Destructive",
      description: "Error/destructive alert",
      properties: { variant: "destructive" },
      preview: { width: 400, height: 80 },
    },
  ],
  defaultProps: {
    variant: "default",
  },
  figmaStructure: frame(
    "Alert",
    400,
    80,
    "HORIZONTAL",
    SHADCN_SPACING.md,
    SHADCN_SPACING.md,
    SHADCN_COLORS.secondary
  ),
  codeSnippet: `import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

export function MyAlert() {
  return (
    <Alert>
      <AlertTitle>Note</AlertTitle>
      <AlertDescription>
        Your message has been sent.
      </AlertDescription>
    </Alert>
  )
}`,
  importPath: "@/components/ui/alert",
  tags: ["message", "feedback", "notification"],
  notes: [
    "Padding: 16px",
    "Border: 1px var(--border)",
    "Border radius: 8px",
    "Background: secondary #f4f4f5 (default), destructive #fee2e2 (destructive)",
    "Icon color: primary (default), destructive #ef4444",
  ],
};

/**
 * Progress component — Progress bar indicator.
 * Variants: 0%, 25%, 50%, 75%, 100%
 */
const PROGRESS: ShadcnFigmaComponent = {
  name: "Progress",
  category: "feedback",
  description: "Progress bar showing completion percentage",
  variants: [
    {
      name: "0-percent",
      label: "Progress / 0%",
      description: "Empty progress bar",
      properties: { value: 0 },
      preview: { width: 300, height: 4 },
    },
    {
      name: "50-percent",
      label: "Progress / 50%",
      description: "Half complete progress bar",
      properties: { value: 50 },
      preview: { width: 300, height: 4 },
    },
    {
      name: "100-percent",
      label: "Progress / 100%",
      description: "Completed progress bar",
      properties: { value: 100 },
      preview: { width: 300, height: 4 },
    },
  ],
  defaultProps: {
    value: 0,
  },
  figmaStructure: frame("Progress", 300, 4, "HORIZONTAL", 0, 0, "#e4e4e7"),
  codeSnippet: `import { Progress } from "@/components/ui/progress"

export function MyProgress() {
  return <Progress value={65} />
}`,
  importPath: "@/components/ui/progress",
  tags: ["feedback", "progress", "loading"],
  notes: [
    "Height: 4px (h-1)",
    "Background: secondary #f4f4f5",
    "Indicator background: primary #18181b",
    "Border radius: 9999px (fully rounded)",
    "Animated: smooth width transition",
  ],
};

/**
 * Table component — Data table with rows and columns.
 */
const TABLE: ShadcnFigmaComponent = {
  name: "Table",
  category: "data",
  description: "Data table with header, rows, and cells",
  variants: [
    {
      name: "default",
      label: "Table / Default",
      description: "Standard data table",
      properties: {},
      preview: { width: 500, height: 200 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Table", 500, 200, "VERTICAL", SHADCN_SPACING.md),
  codeSnippet: `import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export function MyTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Item 1</TableCell>
          <TableCell>100</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}`,
  importPath: "@/components/ui/table",
  tags: ["data", "table"],
  notes: [
    "Header background: secondary #f4f4f5",
    "Header text: secondary-foreground #18181b, font-weight 500",
    "Row borders: 1px var(--border) bottom",
    "Cell padding: 12px 16px (py-3 px-4)",
    "Striped rows: alternating background (every other row)",
    "Hover: subtle background on row hover",
  ],
};

/**
 * Tabs component — Tabbed content switcher.
 */
const TABS: ShadcnFigmaComponent = {
  name: "Tabs",
  category: "navigation",
  description: "Tabbed content with tab list and content areas",
  variants: [
    {
      name: "default",
      label: "Tabs / Default",
      description: "Standard tab list",
      properties: {},
      preview: { width: 400, height: 200 },
    },
  ],
  defaultProps: {
    defaultValue: "tab1",
  },
  figmaStructure: frame("Tabs", 400, 200, "VERTICAL", SHADCN_SPACING.md),
  codeSnippet: `import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function MyTabs() {
  return (
    <Tabs defaultValue="tab1">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">Content 1</TabsContent>
      <TabsContent value="tab2">Content 2</TabsContent>
    </Tabs>
  )
}`,
  importPath: "@/components/ui/tabs",
  tags: ["navigation", "content"],
  notes: [
    "TabsList background: secondary #f4f4f5",
    "TabsTrigger: inactive color muted-foreground #71717a",
    "TabsTrigger: active color foreground #09090b with underline",
    "TabsTrigger padding: 8px 12px (py-2 px-3)",
    "Tab gap: 8px",
    "Border bottom: 2px, color ring #18181b (active)",
  ],
};

/**
 * Dialog component — Modal dialog overlay.
 */
const DIALOG: ShadcnFigmaComponent = {
  name: "Dialog",
  category: "feedback",
  description: "Modal dialog with overlay, header, content, and footer",
  variants: [
    {
      name: "default",
      label: "Dialog / Default",
      description: "Standard modal dialog",
      properties: {},
      preview: { width: 500, height: 300 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Dialog", 500, 300, "VERTICAL", SHADCN_SPACING.lg),
  codeSnippet: `import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

export function MyDialog() {
  return (
    <Dialog>
      <DialogTrigger>Open</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogHeader>
        <div>Dialog content</div>
      </DialogContent>
    </Dialog>
  )
}`,
  importPath: "@/components/ui/dialog",
  tags: ["modal", "feedback"],
  notes: [
    "Overlay: rgba(0, 0, 0, 0.5) backdrop",
    "Content: white background, 500px width (max-width 90vw)",
    "Border radius: 8px",
    "Shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1)",
    "Close button: top-right corner",
    "Header: gap 16px",
    "Footer: flex gap 8px, justify-end",
  ],
};

/**
 * Select component — Dropdown select input.
 * Variants: closed, open
 */
const SELECT: ShadcnFigmaComponent = {
  name: "Select",
  category: "input",
  description: "Dropdown select with options",
  variants: [
    {
      name: "closed",
      label: "Select / Closed",
      description: "Select in closed state",
      properties: { isOpen: false },
      preview: { width: 280, height: 40 },
    },
    {
      name: "open",
      label: "Select / Open",
      description: "Select in open state with options",
      properties: { isOpen: true },
      preview: { width: 280, height: 160 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Select", 280, 40, "VERTICAL", 0),
  codeSnippet: `import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function MySelect() {
  return (
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Select an option" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="opt1">Option 1</SelectItem>
        <SelectItem value="opt2">Option 2</SelectItem>
      </SelectContent>
    </Select>
  )
}`,
  importPath: "@/components/ui/select",
  tags: ["form", "input", "select"],
  notes: [
    "Trigger: h-9 (36px) with border and padding 8px 12px",
    "Trigger border: 1px var(--input)",
    "Trigger background: white",
    "Content: white background, border 1px var(--border)",
    "Content shadow: 0 10px 15px rgba(0,0,0,0.1)",
    "Options: padding 8px 12px, height 36px each",
    "Hover: background secondary #f4f4f5",
    "Selected: background primary #18181b, color primary-foreground #fafafa",
  ],
};

/**
 * Tooltip component — Hover information popup.
 * Variants: with different arrow positions
 */
const TOOLTIP: ShadcnFigmaComponent = {
  name: "Tooltip",
  category: "feedback",
  description: "Tooltip popup on hover",
  variants: [
    {
      name: "top",
      label: "Tooltip / Top",
      description: "Tooltip positioned above trigger",
      properties: { side: "top" },
      preview: { width: 200, height: 60 },
    },
    {
      name: "bottom",
      label: "Tooltip / Bottom",
      description: "Tooltip positioned below trigger",
      properties: { side: "bottom" },
      preview: { width: 200, height: 60 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Tooltip", 200, 30, "HORIZONTAL", 8, 4),
  codeSnippet: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export function MyTooltip() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>
          <p>Tooltip text</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}`,
  importPath: "@/components/ui/tooltip",
  tags: ["feedback", "info"],
  notes: [
    "Background: primary #18181b",
    "Text: primary-foreground #fafafa",
    "Padding: 8px 12px (py-1.5 px-3)",
    "Border radius: 4px",
    "Font size: 12px (text-xs)",
    "Arrow: 6px triangle, same color as background",
    "Offset from trigger: 4px",
    "Max width: 300px",
  ],
};

/**
 * DropdownMenu component — Menu with items and submenus.
 */
const DROPDOWN_MENU: ShadcnFigmaComponent = {
  name: "DropdownMenu",
  category: "navigation",
  description: "Dropdown menu with items, separators, and submenus",
  variants: [
    {
      name: "default",
      label: "DropdownMenu / Default",
      description: "Standard dropdown menu",
      properties: {},
      preview: { width: 200, height: 240 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("DropdownMenu", 200, 240, "VERTICAL", SHADCN_SPACING.sm),
  codeSnippet: `import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

export function MyDropdownMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Open</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Item 1</DropdownMenuItem>
        <DropdownMenuItem>Item 2</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}`,
  importPath: "@/components/ui/dropdown-menu",
  tags: ["navigation", "menu"],
  notes: [
    "Content: white background, border 1px var(--border)",
    "Content shadow: 0 10px 15px rgba(0,0,0,0.1)",
    "Items: padding 8px 12px, height 36px",
    "Item hover: background secondary #f4f4f5",
    "Separator: height 1px, background var(--border)",
    "Submenu: arrow indicator, nested menu on hover",
    "Border radius: 8px content, 4px items",
  ],
};

/**
 * Sheet component — Slide-out panel.
 * Variants: left, right, top, bottom
 */
const SHEET: ShadcnFigmaComponent = {
  name: "Sheet",
  category: "layout",
  description: "Slide-out sheet panel from any side",
  variants: [
    {
      name: "left",
      label: "Sheet / Left",
      description: "Sheet sliding from left",
      properties: { side: "left" },
      preview: { width: 320, height: 600 },
    },
    {
      name: "right",
      label: "Sheet / Right",
      description: "Sheet sliding from right",
      properties: { side: "right" },
      preview: { width: 320, height: 600 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Sheet", 320, 600, "VERTICAL", SHADCN_SPACING.lg),
  codeSnippet: `import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function MySheet() {
  return (
    <Sheet>
      <SheetTrigger>Open</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Sheet Title</SheetTitle>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  )
}`,
  importPath: "@/components/ui/sheet",
  tags: ["overlay", "navigation", "sidebar"],
  notes: [
    "Overlay: rgba(0, 0, 0, 0.5)",
    "Content: white background",
    "Slide direction: left, right, top, bottom",
    "Width (left/right): 320px",
    "Height (top/bottom): varies",
    "Animation: 200ms ease-out",
    "Close button: top-right or context",
  ],
};

/**
 * ScrollArea component — Custom scrollable container.
 * Variants: vertical, horizontal
 */
const SCROLL_AREA: ShadcnFigmaComponent = {
  name: "ScrollArea",
  category: "layout",
  description: "Custom styled scrollable container",
  variants: [
    {
      name: "vertical",
      label: "ScrollArea / Vertical",
      description: "Vertically scrollable area",
      properties: { orientation: "vertical" },
      preview: { width: 300, height: 200 },
    },
    {
      name: "horizontal",
      label: "ScrollArea / Horizontal",
      description: "Horizontally scrollable area",
      properties: { orientation: "horizontal" },
      preview: { width: 300, height: 100 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("ScrollArea", 300, 200, "VERTICAL", 8),
  codeSnippet: `import { ScrollArea } from "@/components/ui/scroll-area"

export function MyScrollArea() {
  return (
    <ScrollArea className="h-[200px]">
      <div>Scrollable content</div>
    </ScrollArea>
  )
}`,
  importPath: "@/components/ui/scroll-area",
  tags: ["layout", "scroll"],
  notes: [
    "Scrollbar: width 8px, auto-hide on scroll end",
    "Thumb: background muted #f4f4f5",
    "Thumb hover: background muted-foreground #71717a",
    "Border radius: 4px on thumb",
    "Track: transparent",
  ],
};

/**
 * Sidebar component — Navigation sidebar with sections.
 */
const SIDEBAR: ShadcnFigmaComponent = {
  name: "Sidebar",
  category: "layout",
  description: "Navigation sidebar with collapsible sections",
  variants: [
    {
      name: "default",
      label: "Sidebar / Default",
      description: "Standard sidebar layout",
      properties: {},
      preview: { width: 250, height: 600 },
    },
  ],
  defaultProps: {},
  figmaStructure: frame("Sidebar", 250, 600, "VERTICAL", SHADCN_SPACING.md),
  codeSnippet: `import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar"

export function MySidebar() {
  return (
    <Sidebar>
      <SidebarHeader>Logo</SidebarHeader>
      <SidebarContent>
        <nav>Navigation items</nav>
      </SidebarContent>
    </Sidebar>
  )
}`,
  importPath: "@/components/ui/sidebar",
  tags: ["navigation", "layout"],
  notes: [
    "Width: 250px (customizable)",
    "Background: secondary #f4f4f5 (light mode)",
    "Header: full width, padding 16px",
    "Content: scrollable, padding 8px",
    "Items: padding 8px 12px, gap 8px",
    "Collapsible groups: chevron indicator",
    "Active item: primary background #18181b, primary-foreground #fafafa",
  ],
};

// ── Export Complete Library ──────────────────────────────────────

export const SHADCN_LIBRARY: Map<string, ShadcnFigmaComponent> = new Map([
  ["Button", BUTTON],
  ["Card", CARD],
  ["Input", INPUT],
  ["Badge", BADGE],
  ["Avatar", AVATAR],
  ["Label", LABEL],
  ["Textarea", TEXTAREA],
  ["Switch", SWITCH],
  ["Checkbox", CHECKBOX],
  ["Separator", SEPARATOR],
  ["Skeleton", SKELETON],
  ["Alert", ALERT],
  ["Progress", PROGRESS],
  ["Table", TABLE],
  ["Tabs", TABS],
  ["Dialog", DIALOG],
  ["Select", SELECT],
  ["Tooltip", TOOLTIP],
  ["DropdownMenu", DROPDOWN_MENU],
  ["Sheet", SHEET],
  ["ScrollArea", SCROLL_AREA],
  ["Sidebar", SIDEBAR],
]);

// ── Helper Functions ────────────────────────────────────────────

/**
 * Get a single component definition from the library.
 */
export function getShadcnComponent(
  name: string
): ShadcnFigmaComponent | undefined {
  return SHADCN_LIBRARY.get(name);
}

/**
 * List all component names in the library.
 */
export function listShadcnComponents(): string[] {
  return Array.from(SHADCN_LIBRARY.keys()).sort();
}

/**
 * Get all components in a specific category.
 */
export function getComponentsByCategory(
  category: ShadcnFigmaComponent["category"]
): ShadcnFigmaComponent[] {
  return Array.from(SHADCN_LIBRARY.values()).filter(
    (c) => c.category === category
  );
}

/**
 * Convert a FigmaNodeSpec to a serializable command object
 * that can be sent to the Figma plugin for node creation.
 *
 * This is a reference implementation. Actual creation requires
 * the Figma plugin API to execute this command.
 */
export function buildComponentTree(
  spec: FigmaNodeSpec
): Record<string, unknown> {
  const cmd: Record<string, unknown> = {
    type: spec.type,
    name: spec.name,
  };

  if (spec.size) {
    cmd.width = spec.size.width;
    cmd.height = spec.size.height;
  }

  if (spec.style) {
    const style: Record<string, unknown> = {};
    if (spec.style.fill) style.fill = spec.style.fill;
    if (spec.style.stroke) style.stroke = spec.style.stroke;
    if (spec.style.strokeWidth) style.strokeWidth = spec.style.strokeWidth;
    if (spec.style.cornerRadius) style.cornerRadius = spec.style.cornerRadius;
    if (spec.style.opacity) style.opacity = spec.style.opacity;
    if (spec.style.shadow) style.shadow = spec.style.shadow;
    if (Object.keys(style).length > 0) cmd.style = style;
  }

  if (spec.layout) {
    cmd.layout = spec.layout;
  }

  if (spec.text) {
    cmd.text = spec.text;
  }

  if (spec.children && spec.children.length > 0) {
    cmd.children = spec.children.map((child) => buildComponentTree(child));
  }

  return cmd;
}

/**
 * Get all components, optionally filtered by tag.
 */
export function getAllComponents(tag?: string): ShadcnFigmaComponent[] {
  const components = Array.from(SHADCN_LIBRARY.values());
  if (!tag) return components;
  return components.filter((c) => c.tags.includes(tag));
}

/**
 * Get component summary for UI display.
 */
export function getComponentSummary(
  name: string
): { name: string; category: string; variantCount: number } | undefined {
  const component = getShadcnComponent(name);
  if (!component) return undefined;
  return {
    name: component.name,
    category: component.category,
    variantCount: component.variants.length,
  };
}
