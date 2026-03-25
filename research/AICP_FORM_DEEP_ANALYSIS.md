# AICP Form Deep Analysis — Structure, UX Problems, and Opportunity Areas

> Source: Domain expert analysis of AICP bid form as a system, not just a form.
> Date: 2026-03-24

---

## 1. What the AICP Form Actually Is

The AICP (Association of Independent Commercial Producers) bid form is a **structured cost model** for commercial production.

It is NOT just a form. It is:

- **A hierarchical budgeting system** — deeply nested financial tree with 4 levels of depth
- **A compliance standard** — used across agencies + production companies as shared language
- **A negotiation artifact** — used in back-and-forth revisions between agency, production company, and client

---

## 2. Structure (Mental Model)

The AICP form is a deeply nested financial tree:

### Level 1 — Sections (macro buckets)
| Section | Description |
|---------|-------------|
| A | Pre-Production |
| B | Production (shoot) |
| C | Post-Production |
| D | Other / Misc |
| E | Agency Fees / Markups |

### Level 2 — Categories (within each section)

Example within Production:
- Crew
- Talent
- Equipment
- Locations
- Travel

### Level 3 — Line Items

Each category explodes into granular rows:
- **Role** (e.g. DP, Gaffer)
- **Units** (days, hours, qty)
- **Rate** (per unit cost)
- **OT / premiums** (overtime multipliers, union premiums)
- **Subtotals** (computed per line)

### Level 4 — Calculations
- Subtotals per category
- Section totals
- Markups (10%, 15%, 25%)
- Contingency
- **Grand total**

---

## 3. Core UX Problems (Why It Feels Painful)

### 3.1 Fragmented Navigation
- Data spread across tabs / sections with no persistent context
- Users constantly scroll, jump, and lose position
- **Impact**: spatial disorientation — users can't maintain a mental map of where they are in the budget

### 3.2 High Cognitive Load
Users must hold simultaneously:
- Budget totals
- Category breakdowns
- Dependencies (crew <-> equipment <-> days)

**Example of hidden dependency chain:**
Changing shoot days affects:
- Crew cost (more day rates)
- Equipment rentals (more rental days)
- Location fees (additional hold days)
- Catering (more meals)

But the form does NOT surface these linkages. Users track them mentally.

### 3.3 Poor Data Density Handling
- Hundreds of rows in flat tables
- Minimal grouping or hierarchy
- No collapsing, no progressive disclosure, no smart summaries

### 3.4 Weak Calculation Transparency
- Totals update silently
- Hard to trace: "Why did this number change?"
- No diff tracking, change logs, or dependency mapping

### 3.5 Inefficient Input Flow
Repetitive entry patterns:
- Same roles across multiple shoot days
- Same vendors reused across bids
- No templates, autofill, or reusable components

### 3.6 Search / Filter Limitations
Hard to:
- Find a specific line item across 300+ rows
- Compare categories side-by-side
- Audit specific cost areas

### 3.7 Versioning + Collaboration Gaps
Real-world workflow: Agency -> Production -> Revisions -> Approvals

But:
- Version history is manual (file naming conventions)
- Comparison between versions is painful (manual side-by-side)
- Comments are external (email, PDF annotations)

---

## 4. Jobs To Be Done (JTBD)

### Core Job
> "Build, adjust, and justify a production budget quickly and accurately under pressure."

### Sub-Jobs

| # | Job | Key Actions |
|---|-----|-------------|
| 1 | **Construct** | Add line items fast, reuse previous bids, stay within budget targets |
| 2 | **Understand** | Where money is going, which sections are heavy, what's driving cost |
| 3 | **Adjust** | Change assumptions (days, crew, locations), see impact instantly |
| 4 | **Defend** | Explain costs to stakeholders, show breakdowns clearly |
| 5 | **Iterate** | Multiple revisions, compare versions, maintain accuracy |

---

## 5. System Reality (Critical for Design)

The AICP form is not a simple form. It is three things:

### A. A Rules Engine
- Overtime calculation rules (1.5x, 2x thresholds)
- Rate cards (union minimums, regional variations)
- Union constraints (SAG-AFTRA, IATSE)
- Markup rules (25% production fee, 3% insurance, 15% travel handling)

### B. A Calculation Graph
- Changing one variable (e.g. shoot days) affects many downstream nodes
- Dependencies are implicit, not surfaced
- The form is actually a DAG (directed acyclic graph) of financial calculations

### C. A Reporting Tool
Output must be:
- Clean and professional
- Standardized (AICP format compliance)
- Shareable (PDF export for agency/client review)

---

## 6. Key Insight (What Most Designers Miss)

The problem is NOT:
> "The form is long"

The REAL problem is:
> **"The system does not externalize complexity"**

Users are currently doing:
- **Mental simulations** — "if I change this, what happens to the total?"
- **Manual dependency tracking** — maintaining a mental model of what affects what
- **Memory-based navigation** — remembering where line items are across 300+ rows

The form forces users to be the computation engine that the software should be.

---

## 7. Opportunity Areas (High Leverage)

### 7.1 Structure: From Flat to Hierarchical + Collapsible
- Tree-based UI with expand/collapse at every level
- Section -> Category -> Line Item hierarchy visible at all times
- Progressive disclosure: start with section summaries, drill into detail

### 7.2 State Awareness
- Persistent totals bar (always visible, like a financial HUD)
- Section summaries with % of total budget
- Cost distribution visualization (treemap, bar chart)

### 7.3 Dependency Awareness
- "Changing shoot days impacts X items" — inline warnings/previews
- Impact preview before committing changes
- Dependency graph visualization

### 7.4 Input Acceleration
- Templates from previous bids
- Smart duplication (copy a shoot day with all crew/equipment)
- Role presets with current union rates pre-populated

### 7.5 Change Intelligence
- Diff view between bid versions
- Change summaries: "+ $12K due to crew increase"
- Revision timeline with annotation

### 7.6 Navigation System
- Global search across all line items
- Jump-to section from anywhere
- Breadcrumbs showing current position in hierarchy
- Keyboard shortcuts for power users

### 7.7 Review Mode
- Clean "presentation layer" for stakeholder review
- Hide mechanics (formulas, notes), show narrative
- Executive summary auto-generated from budget data
- PDF export that matches AICP standard format

---

## Summary

The AICP bid form is a **calculation graph disguised as a spreadsheet**. The core design opportunity is to externalize the complexity that users currently carry mentally — through hierarchy, dependency awareness, persistent state, and intelligent navigation. The winning product is the one that lets a line producer think about the *story* of the budget, not the *mechanics* of the spreadsheet.
