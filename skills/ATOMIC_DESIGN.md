---
name: atomic-design
description: Atomic Design quick reference — levels, composition rules, tokens, naming
user-invocable: false
---

# Atomic Design — Quick Reference

## Level Decision Table

| Level | Folder | Composes | Has State | Fetches Data | Real Content |
|-------|--------|----------|-----------|--------------|-------------|
| Atom | `components/ui/` | Nothing | No | No | No |
| Molecule | `components/molecules/` | 2–5 atoms | Maybe | No | No |
| Organism | `components/organisms/` | Molecules + atoms | Yes | Yes | No |
| Template | `components/templates/` | Organisms | No | No | Placeholder |
| Page | (route file) | Templates | No | Yes | Real |

**If you can't decide:** IF it composes nothing → atom. IF it composes ≤5 atoms → molecule. IF it manages state or fetches data → organism. IF it's a full layout skeleton → template.

## Composition Rules

- Atoms: no `composesSpecs`, no imports of other atoms
- Molecules: 2–5 atom imports, no data fetching, may have internal open/closed state
- Organisms: own breakpoints, document composition in spec
- Templates: CSS Grid or Flexbox only, must match Figma page spec
- Pages: handle all data states — loading, empty, error, populated

## File Structure

```
components/
  ui/            # atoms (shadcn primitives)
  molecules/
  organisms/
  templates/
```

## Design Tokens

```
Global tokens  (--blue-500, --space-4)
  → Alias tokens  (--color-primary, --spacing-component)
    → Component tokens  (--button-bg, --card-radius)
```

Override alias tokens per theme: `:root`, `.dark`, `.brand-b`.

## Accessibility by Level

| Level | Required |
|-------|---------|
| Atom | ARIA role, keyboard focus, contrast, label |
| Molecule | Focus management, error announcements |
| Organism | Landmark roles, skip links, focus trapping |
| Template | Page title, heading hierarchy, main landmark |
| Page | Full WCAG 2.1 AA |

## Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Components | PascalCase | `MetricCard` |
| Props | camelCase | `isLoading` |
| CSS classes | kebab-case | `text-muted-foreground` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Tokens | path/style | `color/primary/500` |

## Figma ↔ Code

| Figma | Code |
|-------|------|
| Component | React component |
| Component Set | Variant type union |
| Component Property | React prop |
| Auto Layout | Flexbox / Grid |
| Design Token | CSS Variable → Tailwind class |
| Section | Organism |

## Anti-Patterns

1. **Premature abstraction** — wait for 3+ use cases before extracting
2. **Prop explosion** — 15+ props → decompose into smaller pieces
3. **CSS override chains** — 5+ overrides → create a variant
4. **Token drift** — hardcoded values that should be tokens
5. **Missing states** — every interactive component needs: default, hover, focus, active, disabled, loading, error
