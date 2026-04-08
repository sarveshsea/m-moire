# Component Catalog — Universal UI Registry

## When to Load
- Creating component specs → use catalog as starting point
- Auditing a design system for completeness
- Mapping Figma components to code
- Generating a component library from scratch
- Answering "what components should this project have?"

## Catalog Location
`src/specs/catalog.ts` — exports `COMPONENT_CATALOG`, category definitions, helper functions.

## Quick Reference

```typescript
import { findCatalogComponent } from "../specs/catalog.js";
const entry = findCatalogComponent("datepicker");
// Returns: { name, level, shadcnBase, category, purpose, props, variants, accessibility }
```

---

## Registry (56 components)

### Buttons

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Button | atom | Button | Primary action trigger |
| IconButton | atom | Button | Action with icon only, no label |
| ButtonGroup | molecule | Button | 2+ related buttons grouped |
| Toggle | atom | Switch | Binary on/off control |
| SegmentedControl | molecule | Tabs | Mutually exclusive option selector |
| Stepper | molecule | Button + Input | Increment/decrement numeric value |

### Inputs

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| TextInput | atom | Input | Single-line text entry |
| Textarea | atom | Textarea | Multi-line text entry |
| SearchInput | atom | Input | Text entry with search affordance |
| Select | atom | Select | Single-choice dropdown |
| Combobox | molecule | Input + Select | Searchable select with free-text |
| Checkbox | atom | Checkbox | Multi-select boolean control |
| RadioButton | atom | — | Single-select within a group |
| Slider | atom | Slider | Range or value picker |
| DateInput | atom | Input | Date entry via text |
| Datepicker | organism | — | Calendar-based date selection |
| ColorPicker | organism | — | Color selection with preview |
| FileUpload | molecule | — | File selection and upload |
| Label | atom | Label | Accessible form field label |
| Fieldset | molecule | — | Groups related form controls |
| Form | organism | — | Full form with validation state |
| Rating | molecule | — | Star or numeric rating input |
| RichTextEditor | organism | — | WYSIWYG text editor |

### Data Display

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Badge | atom | Badge | Short status or count label |
| Avatar | atom | Avatar | User or entity image/initials |
| Card | molecule | Card | Contained content surface |
| Table | organism | Table | Tabular data with rows/columns |
| List | molecule | — | Vertical sequence of items |
| File | molecule | Card | File metadata with icon |
| Skeleton | atom | Skeleton | Loading placeholder |
| Separator | atom | Separator | Visual divider |
| Quote | molecule | — | Blockquote with attribution |

### Feedback

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Alert | molecule | — | Inline status message |
| Toast | molecule | — | Transient notification |
| ProgressBar | atom | Progress | Linear completion indicator |
| ProgressIndicator | molecule | Progress | Step-based progress display |
| Spinner | atom | — | Indeterminate loading indicator |
| EmptyState | molecule | Card | Zero-data placeholder with action |

### Navigation

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Navigation | organism | — | Primary site/app nav |
| Breadcrumbs | molecule | — | Hierarchical location trail |
| Tabs | molecule | Tabs | Content panel switcher |
| Pagination | molecule | Button | Multi-page navigation controls |
| Link | atom | — | Navigational anchor |
| SkipLink | atom | — | Keyboard accessibility bypass |
| TreeView | organism | — | Hierarchical expandable list |

### Overlays

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Modal | organism | Dialog | Blocking overlay with content |
| Drawer | organism | Sheet | Sliding panel overlay |
| Popover | molecule | Popover | Anchored floating content |
| Tooltip | atom | Tooltip | Hover/focus label for an element |
| DropdownMenu | molecule | DropdownMenu | Contextual action list |

### Layout

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Accordion | molecule | — | Expandable content sections |
| Carousel | organism | — | Scrollable item sequence |
| Header | organism | — | App/page top bar |
| Footer | organism | — | App/page bottom bar |
| Hero | molecule | Card | Full-width feature section |
| Stack | atom | — | Linear layout primitive |
| VisuallyHidden | atom | — | Screen-reader-only wrapper |

### Media

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Image | atom | — | Responsive image with alt |
| Icon | atom | — | SVG icon wrapper |
| Video | molecule | — | Video player with controls |

### Typography

| Name | Level | shadcnBase | Purpose |
|------|-------|------------|---------|
| Heading | atom | — | H1–H6 with variant control |

---

## Atomic Distribution

| Level | Count | Composition Rule |
|-------|-------|-----------------|
| Atom | ~22 | Standalone. `composesSpecs` must be empty. |
| Molecule | ~22 | Composes 2–5 atoms. No data fetching. |
| Organism | ~12 | Composes molecules + atoms. May fetch data. |

---

## Rules

1. **shadcn first** — if a catalog component has a `shadcnBase`, use it. Don't build custom.
2. **Prevalence = priority** — higher prevalence = implement first.
3. **Catalog is the baseline** — every project should eventually spec all 56 components.
4. **Aliases resolve** — `findCatalogComponent("Dialog")` finds Modal; `"Switch"` finds Toggle.
5. **Extend, don't fork** — add project-specific components alongside catalog components, never replace them.

---

## Scaffold a Spec from Catalog

```typescript
import { findCatalogComponent } from "../specs/catalog.js";

const entry = findCatalogComponent("datepicker");
// Pre-fill spec with: entry.level, entry.shadcnBase, entry.variants,
// entry.props, entry.accessibility
```

## Audit Completeness

```typescript
import { COMPONENT_CATALOG } from "../specs/catalog.js";

const missing = COMPONENT_CATALOG.filter(c => !registry.hasSpec(c.name));
// Shows which catalog components are not yet specced
```
