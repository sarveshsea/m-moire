# /figma-audit — Design System Audit & Quality Check

> Audit a Figma file for design system consistency, accessibility compliance, token adoption, and Code Connect coverage. Produces actionable findings. Requires /figma-use.

## Freedom Level: Read-Only + Report

Audit skills read and analyze but do not modify the canvas. Output is a structured report with severity levels.

## When to Use
- Before a design handoff to development
- After pulling a design system (`memi pull`)
- Periodic design system health checks
- When components look inconsistent or broken
- Before establishing Code Connect mappings

## Audit Checklist

### 1. Token Adoption
```
figma_get_variables → list all defined tokens
get_design_context for each page → check usage

Report:
  ✓ Bound to variable: colors/primary/500
  ✗ Raw hex: #3b82f6 (should be colors/primary/500)
  ✗ Magic number: 16px padding (should be spacing/4)

Metric: % of visual properties bound to variables
Target: 90%+
```

### 2. Component Consistency
```
figma_search_components → list all components
figma_get_component_details for each → check structure

Report:
  ✓ Auto Layout applied
  ✓ Properties documented
  ✓ Variants complete (default, hover, active, disabled, focused)
  ✗ Missing state: Button has no "loading" variant
  ✗ Inconsistent padding: Card uses 16px, CardHeader uses 12px

Metric: % of components with all required states
Target: 100% for atoms, 90% for molecules
```

### 3. Atomic Design Compliance
```
Check each component's classification:
  ✓ Atom: no nested component instances (correct)
  ✗ Atom: Button contains Icon instance (should be molecule or use instance swap)
  ✓ Molecule: FormField composes Label + Input + HelpText
  ✗ Organism: LoginForm classified as molecule (too complex)

Metric: % of components correctly classified
Target: 95%+
```

### 4. Accessibility
```
For each component:
  ✓ Contrast ratio: text on background meets WCAG AA (4.5:1)
  ✗ Touch target: Button is 32px tall (needs 44px minimum)
  ✓ Focus indicator: visible focus ring
  ✗ Missing: no aria-label on icon-only button

For each page:
  ✓ Heading hierarchy: h1 → h2 → h3 (no skips)
  ✗ Missing landmark: no main content area defined
  ✓ Color not sole indicator: error states use icon + color

Metric: WCAG violations per page
Target: 0 critical, <5 minor
```

### 5. Code Connect Coverage
```
get_code_connect_map → current mappings

Report:
  ✓ Mapped: Button → src/components/ui/button.tsx
  ✓ Mapped: Card → src/components/ui/card.tsx
  ✗ Unmapped: MetricCard (no code counterpart)
  ✗ Stale: FormField maps to deleted file

Metric: % of components with valid Code Connect
Target: 80%+ for atoms, 60%+ for molecules
```

### 6. Naming Conventions
```
Check against naming rules:
  ✓ PascalCase: MetricCard, LoginForm
  ✗ Wrong case: metric-card (should be MetricCard)
  ✗ Vague name: "Frame 47" (rename to meaningful name)
  ✓ Token path: colors/primary/500

Metric: % of elements following naming conventions
Target: 100%
```

### 7. Auto Layout Health
```
For each container:
  ✓ Has Auto Layout
  ✗ Uses absolute positioning (should be Auto Layout)
  ✓ Sizing: fill container (correct for content area)
  ✗ Sizing: hug contents (should be fill for responsive element)
  ✓ Spacing uses token values

Metric: % of containers using Auto Layout
Target: 95%+
```

## Output Format
```
╔══════════════════════════════════════╗
║     Design System Audit Report       ║
╚══════════════════════════════════════╝

Score: 82/100

Token Adoption:      87% ✓
Component Quality:   79% ⚠
Atomic Compliance:   95% ✓
Accessibility:       74% ⚠
Code Connect:        65% ✗
Naming:             92% ✓
Auto Layout:         89% ✓

Critical Issues (fix immediately):
  1. Button has no focus indicator
  2. 23 raw hex values should be variables
  3. FormField Code Connect points to deleted file

Warnings (fix soon):
  1. MetricCard missing "loading" variant
  2. 5 components have inconsistent padding

Recommendations:
  1. Run: memi tokens → re-export and bind
  2. Run: add_code_connect_map for 12 unmapped components
  3. Add missing variant states to 8 components
```

## Integration
- Save audit results to `.memoire/audit.json` for tracking over time
- Compare against previous audits to show improvement
- Block `memi sync` if critical issues exceed threshold
