---
name: Competitive Intel
description: >
  Systematic competitive intelligence and market analysis. Covers competitor
  identification, feature matrices, UX benchmarking, positioning maps, design
  pattern audits, pricing analysis, and ongoing monitoring frameworks. Outputs
  connect directly to Memoire spec and research systems.
activateOn: research-to-dashboard
freedomLevel: high
category: research
tags:
  - competitive-analysis
  - market-research
  - benchmarking
  - ux-audit
  - feature-matrix
  - positioning
  - design-patterns
  - pricing-analysis
---

# Competitive Intelligence — Memoire Research Skill

This skill drives rigorous competitive analysis from identification through
actionable output. Every section maps to concrete deliverables that feed
Memoire's spec, research, and codegen pipelines.

---

## Quick Reference — Decision Table

Use this table to decide which analysis to run based on the trigger situation.

| Situation | Analysis Type | Output | Time |
|-----------|--------------|--------|------|
| New product launch | Full Landscape Mapping | Positioning map + feature matrix | 2-3 days |
| Feature prioritization debate | Feature Matrix Deep Dive | Gap analysis + priority score | 1 day |
| Redesign initiative | UX Benchmarking | Task-based scores + pattern audit | 2-3 days |
| Pricing change needed | Pricing Architecture Analysis | Tier comparison + elasticity map | 1 day |
| Quarterly strategy review | Competitive Pulse Check | Signal report + updated matrix | 4 hours |
| New competitor entered market | Rapid Threat Assessment | SWOT + positioning impact | 4 hours |
| Investor / board deck needed | Executive Competitive Brief | 1-page landscape + 3 moves | 2 hours |
| User churn increasing | Switching Cost Analysis | Competitor migration paths | 1 day |
| Entering new market segment | Adjacent Market Scan | Landscape map for new segment | 2 days |
| Design system overhaul | Cross-Industry Pattern Audit | Best-in-class pattern library | 3 days |

### Priority Framework

When time is limited, run analyses in this order:

1. **Positioning map** — fastest strategic clarity
2. **Feature matrix** — reveals gaps and differentiators
3. **UX task comparison** — reveals experience quality gaps
4. **Pricing analysis** — reveals business model gaps
5. **Design pattern audit** — reveals craft gaps
6. **Technical deep dive** — reveals infrastructure gaps

---

## Competitive Landscape Mapping

### Competitor Identification

#### Tier 1 — Direct Competitors
Same problem, same target audience, same business model.

Identification methods:
- Search the exact problem statement on Google, Product Hunt, G2
- Check "Alternatives to [product]" pages on G2, Capterra, AlternativeTo
- Monitor the same keywords in App Store / Play Store
- Track who bids on the same paid search terms (SpyFu, SEMrush)
- Ask sales team who they lose deals to

Capture for each:
- Company name, URL, founding year
- Funding stage and total raised (Crunchbase)
- Estimated team size (LinkedIn)
- Estimated revenue range (if public: SEC filings; if private: employee count heuristic)
- Primary positioning statement (from homepage hero)
- Target persona (from their marketing copy)

#### Tier 2 — Indirect Competitors
Same problem, different audience or different approach.

Examples: A B2B analytics tool competes indirectly with spreadsheets, custom SQL dashboards, and consulting firms that deliver reports manually.

Identification methods:
- Think about how the problem was solved before your category existed
- Look at what users were doing before they adopted your product (ask in onboarding)
- Check adjacent categories on G2/Capterra
- Monitor "I use X instead of Y" discussions on Reddit, HN, Twitter

#### Tier 3 — Adjacent Competitors
Different problem, same audience. They compete for budget and attention.

Identification methods:
- Map the full tool stack of your ideal customer
- Identify which tools are expanding toward your space
- Watch for platform plays that bundle your feature as one of many
- Track partnerships and integrations in your ecosystem

#### Tier 4 — Aspirational Benchmarks
Best-in-class from any industry. Not competitors — references for excellence.

Selection criteria:
- Best onboarding experience (regardless of industry)
- Best data visualization approach
- Best mobile experience
- Best accessibility implementation
- Best pricing page design
- Best documentation / help system
- Best community engagement model

### Building the Competitor Registry

Store each competitor as a research insight in Memoire:

```
Tag format: competitor:{name}, tier:{1|2|3|4}, segment:{segment}
```

Minimum fields per competitor entry:
- `name`: Company name
- `url`: Primary product URL
- `tier`: 1-4 classification
- `positioning`: Their one-line value proposition
- `targetPersona`: Who they sell to
- `pricingModel`: Free, freemium, subscription, usage-based, enterprise
- `pricingRange`: Low end to high end
- `fundingStage`: Bootstrap, seed, series A-F, public
- `teamSize`: Estimated headcount
- `techStack`: Known technologies (from BuiltWith, job postings)
- `strengths`: Top 3 perceived strengths
- `weaknesses`: Top 3 perceived weaknesses
- `lastUpdated`: Date of last review

---

## Positioning Map

### Axis Selection

The positioning map is a 2x2 matrix. Axis selection determines the strategic
insight you extract. Choose axes that reveal meaningful gaps.

#### Common Axis Pairs

| X-Axis | Y-Axis | Reveals |
|--------|--------|---------|
| Price (low to high) | Feature breadth (narrow to broad) | Value positioning |
| Simplicity (simple to complex) | Power (basic to advanced) | Usability vs capability tradeoff |
| Consumer focus to Enterprise focus | Vertical (niche) to Horizontal (general) | Market segment strategy |
| Self-serve to Sales-led | SMB to Enterprise | Go-to-market approach |
| Design quality (low to high) | Technical depth (shallow to deep) | Craft investment |
| Time to value (slow to fast) | Customizability (rigid to flexible) | Onboarding strategy |
| Community-driven to Company-driven | Open source to Proprietary | Ecosystem model |

#### Custom Axis Construction

For industry-specific maps, construct axes from your product's key differentiators:

1. List your top 5 differentiators
2. List your top 5 weaknesses
3. Create axes where you land in a favorable quadrant
4. Validate: do competitors spread across all 4 quadrants? If they cluster, the axes are not discriminating enough

### Plotting

Score each competitor 1-10 on each axis. Place on the map. Then:

1. **Identify clusters** — crowded quadrants mean commoditized positions
2. **Identify white space** — empty quadrants are either opportunities or dead zones
3. **Validate white space** — is the empty quadrant empty because nobody wants to be there, or because nobody has figured it out yet?
4. **Draw movement arrows** — where are competitors heading based on recent moves?

### Output as Memoire DataViz Spec

Generate a scatter plot spec:

```json
{
  "specType": "dataviz",
  "vizType": "scatter",
  "title": "Competitive Positioning Map",
  "axes": {
    "x": { "label": "{axis-label}", "min": 0, "max": 10 },
    "y": { "label": "{axis-label}", "min": 0, "max": 10 }
  },
  "dataPoints": [
    { "label": "Us", "x": 7, "y": 8, "size": "large", "color": "primary" },
    { "label": "Competitor A", "x": 5, "y": 6, "size": "medium", "color": "neutral" }
  ],
  "quadrantLabels": {
    "topRight": "Leaders",
    "topLeft": "Specialists",
    "bottomRight": "Disruptors",
    "bottomLeft": "Commodities"
  }
}
```

---

## Feature Matrix Framework

### Structure

Organize features into categories. Each category contains 5-15 discrete features.

#### Standard Category Template

| Category | Feature | Us | Comp A | Comp B | Comp C | Weight |
|----------|---------|-----|--------|--------|--------|--------|
| Core | {feature} | {status} | {status} | {status} | {status} | {1-5} |

#### Status Values

| Status | Symbol | Meaning |
|--------|--------|---------|
| `full` | ● | Complete, production-ready implementation |
| `partial` | ◐ | Exists but limited — missing key sub-features |
| `beta` | ◑ | Available but not stable / feature-flagged |
| `planned` | ○ | On public roadmap or confirmed by company |
| `none` | — | Not available, no indication it's coming |
| `unique` | ★ | Only this competitor offers it |
| `deprecated` | ✕ | Was available, being removed |

#### Numeric Scoring (for weighted analysis)

Convert status to numeric for calculations:
- `full` = 1.0
- `partial` = 0.5
- `beta` = 0.3
- `planned` = 0.1
- `none` = 0.0
- `unique` = 1.0 (with bonus flag)
- `deprecated` = 0.0

### Universal Feature Categories

These categories apply across most SaaS products. Select the ones relevant
to the product under analysis.

1. **Core Functionality** — the primary jobs-to-be-done features
2. **User Management** — auth, roles, permissions, teams, SSO
3. **Data & Analytics** — dashboards, reports, exports, custom queries
4. **Integrations** — native integrations, API, webhooks, Zapier
5. **Collaboration** — sharing, commenting, real-time editing, notifications
6. **Customization** — theming, white-labeling, custom fields, workflows
7. **Mobile** — native apps, responsive web, offline support
8. **Security** — encryption, compliance (SOC2, GDPR), audit logs
9. **Performance** — speed, uptime SLA, scalability
10. **Support** — docs, chat, phone, SLA, community
11. **AI / Automation** — AI features, workflow automation, smart defaults
12. **Developer Experience** — API quality, SDKs, CLI, documentation
13. **Pricing Flexibility** — free tier, trials, usage-based, annual discounts

### Analysis Patterns

After completing the matrix, run these analyses:

#### Gap Analysis
```
For each feature where we = "none" and any competitor = "full":
  → Priority = feature_weight * count_of_competitors_with_full
  → Sort by priority descending
  → Top 5 = critical gaps to address
```

#### Differentiation Analysis
```
For each feature where we = "full" and all competitors = "none" or "partial":
  → This is a differentiator
  → Validate: do customers actually care about this?
  → If yes: double down, make it prominent in positioning
  → If no: potential over-investment, consider reallocating
```

#### Table Stakes Identification
```
For each feature where ALL competitors (including us) = "full":
  → This is table stakes
  → Do not compete on this — just maintain parity
  → Do not emphasize in marketing (everyone has it)
```

#### Emerging Feature Detection
```
For each feature where exactly 1-2 competitors = "full" or "beta":
  → This is an emerging pattern
  → Evaluate: is this a real trend or an experiment?
  → If 2+ competitors ship it within 6 months: likely trend
  → Decision: fast-follow, leapfrog, or intentionally skip
```

#### Competitive Score Calculation
```
For each competitor:
  score = SUM(feature_status_numeric * feature_weight) / SUM(feature_weight)
  → Normalize to 0-100
  → Compare scores across competitors
  → Track score changes over time (quarterly)
```

### Output as Memoire ComponentSpec

Generate an interactive comparison table:

```json
{
  "specType": "component",
  "atomicLevel": "organism",
  "name": "FeatureComparisonMatrix",
  "description": "Interactive feature comparison table with filtering and sorting",
  "props": {
    "categories": "FeatureCategory[]",
    "competitors": "Competitor[]",
    "highlightGaps": "boolean",
    "showScores": "boolean"
  },
  "composesSpecs": ["DataTable", "Badge", "Tooltip", "FilterBar"]
}
```

---

## UX Benchmarking

### Heuristic Evaluation Framework

Evaluate each competitor against an extended heuristic set. Score each
heuristic 1-5 for each competitor.

#### Nielsen's 10 Heuristics (Extended to 15)

| # | Heuristic | What to Evaluate | Score Guide |
|---|-----------|-------------------|-------------|
| 1 | Visibility of system status | Loading states, progress indicators, sync status, real-time feedback | 5=instant feedback everywhere, 1=silent failures |
| 2 | Match between system and real world | Language, metaphors, icon clarity, mental model alignment | 5=speaks user's language, 1=developer jargon |
| 3 | User control and freedom | Undo/redo, cancel flows, back navigation, draft saving | 5=full undo everywhere, 1=destructive actions with no escape |
| 4 | Consistency and standards | Internal consistency, platform conventions, design system adherence | 5=pixel-perfect consistency, 1=every page feels different |
| 5 | Error prevention | Confirmation dialogs, input validation, smart defaults, constraints | 5=impossible to make mistakes, 1=errors easy to trigger |
| 6 | Recognition over recall | Visible options, recent items, search, contextual help | 5=everything discoverable, 1=must memorize paths |
| 7 | Flexibility and efficiency | Keyboard shortcuts, bulk actions, customization, power user paths | 5=expert and novice paths, 1=one rigid workflow |
| 8 | Aesthetic and minimalist design | Visual clarity, information density, whitespace, typography | 5=every pixel earns its place, 1=cluttered and noisy |
| 9 | Error recovery | Error messages quality, recovery suggestions, data preservation | 5=helpful messages with fix actions, 1=generic error codes |
| 10 | Help and documentation | In-app help, tooltips, docs quality, search, tutorials | 5=comprehensive and contextual, 1=no help available |
| 11 | Accessibility | WCAG level, screen reader support, keyboard nav, color contrast | 5=AAA compliant, 1=fails basic checks |
| 12 | Performance | Page load, interaction responsiveness, animation smoothness | 5=instant everything, 1=perceptible lag on every action |
| 13 | Trust and credibility | Security indicators, social proof, transparency, data ownership | 5=clearly trustworthy, 1=feels sketchy |
| 14 | Onboarding and learnability | Time to first value, guided tours, progressive disclosure | 5=productive in minutes, 1=requires training |
| 15 | Emotional design | Delight moments, personality, micro-interactions, brand feeling | 5=memorable and enjoyable, 1=purely utilitarian |

#### Scoring Protocol

For each heuristic per competitor:
1. Spend 10-15 minutes evaluating that specific heuristic
2. Document 2-3 specific observations (positive or negative)
3. Capture screenshots of notable examples
4. Assign score 1-5 with brief justification
5. Flag any "best in class" examples worth emulating

### Task-Based Comparison

#### Defining Core Tasks

Select 5-7 tasks that represent the primary user journey. Tasks should be:
- Specific and completable (not "use the product")
- Representative of different journey stages
- Measurable (clear start and end point)

Example task set for a project management tool:
1. Create a new project with 3 tasks
2. Assign a task to a team member
3. Track progress on a multi-step project
4. Generate a status report
5. Find and resolve an overdue task
6. Set up an automated workflow
7. Invite and onboard a new team member

#### Task Execution Protocol

For each task on each competitor:

```
Task: {task_name}
Competitor: {competitor_name}
Date: {date}

Steps taken:
1. {step}
2. {step}
...

Metrics:
- Steps to complete: {number}
- Time to complete: {seconds}
- Errors encountered: {number}
- Confusion points: {number}
- Help needed: {yes/no, what kind}

Scores (1-5):
- Effectiveness: {did I complete it?}
- Efficiency: {how fast/few steps?}
- Satisfaction: {how did it feel?}
- Learnability: {could I do it again faster?}

Notable observations:
- {positive or negative patterns}

Screenshots:
- {paths to captured screenshots}
```

#### Aggregate Scoring

```
Per competitor:
  Task Score = (effectiveness * 0.4) + (efficiency * 0.3) + (satisfaction * 0.2) + (learnability * 0.1)
  Overall UX Score = average of all task scores
  Normalize to 0-100
```

### Design Pattern Audit

Examine these specific patterns across all competitors:

#### Navigation Architecture
- Primary navigation style: sidebar, top bar, bottom bar, hamburger
- Navigation depth: how many clicks to deepest content
- Search: global search presence, quality, filters
- Breadcrumbs: presence and accuracy
- Information architecture: how many top-level sections

#### Onboarding Flow
- Account creation: steps, required fields, social login options
- First-run experience: guided tour, checklist, sample data, empty states
- Time to value: minutes from signup to first meaningful action
- Activation triggers: what do they consider "activated"
- Progressive disclosure: how do they introduce advanced features over time

#### Empty States
- First-time empty states: illustration, CTA, guidance
- Data-dependent empty states: what shows when a filter returns nothing
- Error empty states: connection lost, permission denied
- Emotional tone: encouraging, neutral, or sterile

#### Data Visualization
- Chart types used and appropriateness
- Interactivity: hover, click, drill-down, filter
- Responsiveness: how charts adapt to mobile / small screens
- Accessibility: alt text, color-blind safe palettes, data tables
- Export options: PNG, SVG, CSV, PDF

#### Settings and Configuration
- Organization: flat list, categorized, searchable
- Discoverability: can users find what they need
- Dangerous actions: how are destructive settings protected
- Default values: are defaults sensible for new users

#### Pricing Page Patterns
- Number of tiers: typically 3-4
- Tier naming conventions
- Feature comparison presentation
- CTA placement and wording
- FAQ section presence
- Enterprise / custom tier handling
- Annual vs monthly toggle
- Free tier or trial presentation

---

## Data Collection Methods

### Public Intelligence Sources

#### Product Intelligence
| Source | What It Reveals | Refresh Cadence |
|--------|----------------|-----------------|
| Homepage hero section | Current positioning and value prop | Monthly |
| Pricing page | Business model, target segments, feature tiers | Monthly |
| Changelog / release notes | Development velocity, priorities, direction | Weekly |
| Blog | Thought leadership topics, target audience | Bi-weekly |
| Documentation | Technical depth, API maturity, developer focus | Monthly |
| Help center | Common pain points (most viewed articles) | Quarterly |
| Status page | Reliability, incident frequency, transparency | Monthly |
| Careers page | Team growth areas, tech stack, upcoming initiatives | Monthly |

#### Market Intelligence
| Source | What It Reveals | Refresh Cadence |
|--------|----------------|-----------------|
| G2 / Capterra reviews | User sentiment, strengths, weaknesses, switching reasons | Quarterly |
| App Store / Play Store | Mobile strategy, ratings trend, review themes | Monthly |
| Reddit / HN discussions | Developer sentiment, unfiltered opinions | Monthly |
| Twitter / X mentions | Brand perception, support responsiveness | Weekly |
| LinkedIn company page | Hiring velocity, department growth, culture | Monthly |
| Glassdoor | Internal culture, management quality, morale | Quarterly |

#### Financial and Strategic Intelligence
| Source | What It Reveals | Refresh Cadence |
|--------|----------------|-----------------|
| Crunchbase | Funding, investors, valuation signals | Quarterly |
| SEC filings (public cos) | Revenue, growth rate, strategy narrative | Quarterly |
| Patent filings | R&D direction, future capabilities | Semi-annually |
| Press releases | Partnerships, major customers, milestones | Monthly |
| Conference talks | Technical direction, team expertise | Quarterly |

### Technical Intelligence

#### Stack Analysis
- **BuiltWith / Wappalyzer**: Frontend framework, analytics, CDN, hosting
- **Job postings**: Reveal tech stack decisions, scaling challenges, new initiatives
- **Open source repos**: Code quality, activity, community engagement
- **API docs**: Architecture philosophy, rate limits, data model

#### Performance Benchmarking
Run these tests on each competitor's primary pages:

```
Lighthouse audit:
  - Performance score
  - Accessibility score
  - Best practices score
  - SEO score
  - Core Web Vitals: LCP, FID, CLS

WebPageTest:
  - First byte time
  - Start render
  - Fully loaded time
  - Total page weight
  - Number of requests

Mobile:
  - Responsive breakpoints
  - Touch target sizes
  - Mobile-specific features
  - Offline capability
```

#### SEO and Traffic Analysis
- **Domain authority**: Ahrefs/Moz domain rating
- **Organic keywords**: Top ranking terms and volume
- **Traffic estimates**: SimilarWeb monthly visits, traffic sources
- **Backlink profile**: Quality and quantity of referring domains
- **Content strategy**: Blog frequency, topics, engagement

---

## Pricing Analysis

### Pricing Model Classification

| Model | Description | When It Works |
|-------|------------|---------------|
| Flat rate | Single price, all features | Simple product, single persona |
| Tiered | 2-5 tiers with increasing features | Multiple personas with different needs |
| Per-seat | Price per user | Collaboration tools, team-based products |
| Usage-based | Price scales with consumption | Infrastructure, API, data products |
| Hybrid | Base + usage or seat + usage | Complex products with variable consumption |
| Freemium | Free tier + paid upgrades | Consumer / PLG products |
| Free trial | Time-limited full access | Enterprise / high-ACV products |
| Enterprise | Custom pricing, sales-led | Large-deal, complex deployment products |

### Pricing Comparison Template

```
| Dimension | Us | Comp A | Comp B | Comp C |
|-----------|-----|--------|--------|--------|
| Model type | | | | |
| Free tier | | | | |
| Entry price | | | | |
| Mid-tier price | | | | |
| Enterprise price | | | | |
| Billing options | | | | |
| Per-seat or flat | | | | |
| Usage limits | | | | |
| Overage policy | | | | |
| Contract length | | | | |
| Annual discount % | | | | |
| Key tier gates | | | | |
```

### Value Metric Analysis

The value metric is what the pricing scales with. Analyze:
- What metric does each competitor charge on? (seats, events, storage, API calls)
- Does the metric align with the value the customer receives?
- Is it predictable for buyers? (seats = predictable; events = variable)
- Does it create expansion revenue naturally?

### Switching Cost Assessment

For each competitor, evaluate what it takes for a user to leave:

| Switching Factor | Low | Medium | High |
|-----------------|-----|--------|------|
| Data export | Full export available | Partial / manual | Locked in |
| Integration dependencies | Few / standard | Moderate | Deep / custom |
| Team retraining | Minimal | Moderate | Significant |
| Contract lock-in | Monthly | Annual | Multi-year |
| Data format | Open / standard | Proprietary but convertible | Proprietary and locked |
| Workflow recreation | Simple | Moderate | Complex |

---

## Reporting Formats

### Executive Competitive Brief (1-Page)

Structure:
```
COMPETITIVE LANDSCAPE — {Product Name} — {Date}

MARKET POSITION
One sentence: where we sit relative to competitors.

POSITIONING MAP
[2x2 scatter plot — embedded or linked]

TOP 3 THREATS
1. {Competitor}: {specific threat and timeline}
2. {Competitor}: {specific threat and timeline}
3. {Trend}: {market shift that affects us}

TOP 3 OPPORTUNITIES
1. {Gap}: {what we can exploit and how}
2. {Weakness}: {competitor vulnerability we can target}
3. {Trend}: {market shift we can ride}

RECOMMENDED MOVES (next 90 days)
1. {Action}: {expected impact}
2. {Action}: {expected impact}
3. {Action}: {expected impact}
```

### Full Competitive Report

10-section structure. Generate as Memoire PageSpec:

1. **Executive Summary** — 1-page brief (above)
2. **Market Landscape** — positioning map + competitor registry
3. **Feature Matrix** — full comparison with gap analysis
4. **UX Benchmarking** — heuristic scores + task-based comparison
5. **Design Pattern Analysis** — pattern audit with screenshots
6. **Technical Comparison** — stack, performance, architecture
7. **Pricing Analysis** — model comparison + value metric analysis
8. **SWOT per Competitor** — individual threat/opportunity profiles
9. **Strategic Recommendations** — prioritized actions with rationale
10. **Appendix** — raw data, screenshots, methodology notes

### SWOT Template (Per Competitor)

```
COMPETITOR: {name}
LAST UPDATED: {date}

STRENGTHS (internal, positive)
- {strength}: {evidence}
- {strength}: {evidence}

WEAKNESSES (internal, negative)
- {weakness}: {evidence}
- {weakness}: {evidence}

OPPORTUNITIES (external, positive)
- {opportunity}: {how we can exploit}
- {opportunity}: {how we can exploit}

THREATS (external, negative)
- {threat}: {our mitigation plan}
- {threat}: {our mitigation plan}

OVERALL THREAT LEVEL: {low | medium | high | critical}
TRAJECTORY: {declining | stable | growing | accelerating}
```

### Ongoing Monitoring Cadence

| Cadence | Activity | Output |
|---------|----------|--------|
| Weekly | Scan competitor changelogs, social media, news | Signal log entry |
| Monthly | Review pricing pages, homepage positioning, new features | Updated feature matrix cells |
| Quarterly | Full feature matrix refresh, UX spot checks, positioning map update | Quarterly competitive pulse report |
| Semi-annually | Deep UX benchmarking, full heuristic evaluation | UX benchmark report |
| Annually | Complete competitive landscape refresh | Full competitive report |

---

## Integration with Memoire Systems

### Research Engine Integration

Store all competitive data as Memoire research insights:

```
Insight tagging convention:
  source: "competitive-analysis"
  competitor: "{competitor-name}"
  analysisType: "feature-matrix" | "ux-benchmark" | "positioning" | "pricing" | "pattern-audit"
  tier: "1" | "2" | "3" | "4"
  date: "{ISO date}"
```

Use Memoire's research synthesizer to:
- Cross-reference competitor insights with user research findings
- Identify where competitor strengths align with user pain points (critical gaps)
- Generate themes from patterns across multiple competitors
- Feed synthesized insights into the research report pipeline

### Spec Generation

#### Feature Matrix to ComponentSpec

```json
{
  "specType": "component",
  "atomicLevel": "organism",
  "name": "CompetitiveFeatureMatrix",
  "description": "Interactive competitive feature comparison with filtering, sorting, and gap highlighting",
  "variant": "default",
  "props": {
    "data": "CompetitiveMatrixData",
    "competitors": "CompetitorProfile[]",
    "categories": "FeatureCategory[]",
    "showGapHighlighting": "boolean",
    "showScores": "boolean",
    "filterByCategory": "string | null",
    "sortBy": "'score' | 'gaps' | 'name'"
  },
  "composesSpecs": ["DataTable", "Badge", "Tooltip", "Select", "FilterBar"],
  "tokens": {
    "gapColor": "destructive",
    "differentiatorColor": "primary",
    "tableStakesColor": "muted",
    "emergingColor": "warning"
  }
}
```

#### Positioning Map to DataVizSpec

```json
{
  "specType": "dataviz",
  "vizType": "scatter",
  "name": "CompetitivePositioningMap",
  "description": "2x2 positioning map showing competitor landscape with quadrant labels",
  "data": {
    "source": "research-insights",
    "filter": { "analysisType": "positioning" }
  },
  "encoding": {
    "x": { "field": "axisX", "label": "{dynamic}", "scale": [0, 10] },
    "y": { "field": "axisY", "label": "{dynamic}", "scale": [0, 10] },
    "size": { "field": "marketShare", "range": [20, 80] },
    "color": { "field": "tier", "scheme": ["primary", "secondary", "muted", "accent"] },
    "label": { "field": "name" }
  },
  "annotations": {
    "quadrants": true,
    "quadrantLabels": ["Leaders", "Specialists", "Disruptors", "Commodities"],
    "movementArrows": true
  }
}
```

#### Benchmark Scores to PageSpec

```json
{
  "specType": "page",
  "name": "CompetitiveIntelDashboard",
  "description": "Competitive intelligence dashboard with positioning map, feature matrix, and benchmark scores",
  "template": "DashboardTemplate",
  "sections": [
    {
      "name": "positioning",
      "component": "CompetitivePositioningMap",
      "span": "full"
    },
    {
      "name": "featureMatrix",
      "component": "CompetitiveFeatureMatrix",
      "span": "full"
    },
    {
      "name": "uxScores",
      "component": "BenchmarkScorecard",
      "span": "half"
    },
    {
      "name": "pricingComparison",
      "component": "PricingComparisonTable",
      "span": "half"
    },
    {
      "name": "signalFeed",
      "component": "CompetitiveSignalFeed",
      "span": "full"
    }
  ]
}
```

### Research-to-Dashboard Pipeline

When activated via `research-to-dashboard` context:

1. **Collect** — Pull all insights tagged `source: competitive-analysis`
2. **Validate** — Check freshness (warn if data older than 90 days)
3. **Structure** — Organize into positioning, features, UX, pricing buckets
4. **Score** — Calculate competitive scores, gap counts, threat levels
5. **Generate** — Create DataViz specs for each visualization
6. **Compose** — Assemble into the CompetitiveIntelDashboard PageSpec
7. **Render** — Generate components and preview via Memoire's codegen pipeline

---

## Anti-Patterns and Quality Checks

### Analysis Anti-Patterns

| Anti-Pattern | Why It Fails | Correction |
|-------------|-------------|------------|
| Feature counting without weighting | Not all features matter equally | Weight by user impact and strategic importance |
| Using marketing copy as data | Marketing overstates and misdirects | Verify every claim by using the product |
| Ignoring indirect competitors | Disruption comes from adjacent spaces | Always include Tier 2 and Tier 3 competitors |
| Static one-time analysis | Markets move; stale data misleads | Follow the monitoring cadence above |
| Focusing only on weaknesses | Misses what competitors do well that we should learn from | Document strengths with same rigor as weaknesses |
| Confirmation bias in scoring | Tendency to score self high, competitors low | Use blind scoring or have multiple raters |
| Ignoring free/open-source alternatives | OSS competitors erode willingness to pay | Include relevant OSS in Tier 2 |
| Depth-blind comparison | Marking "full" when implementation is shallow | Evaluate implementation quality, not just presence |
| Ignoring ecosystem and community | Community moats are real competitive advantages | Track GitHub stars, Discord/Slack size, forum activity |
| Analysis without action | Reports that don't lead to decisions are waste | Every analysis must end with recommended moves |

### Quality Checklist

Before finalizing any competitive analysis:

- [ ] All Tier 1 competitors identified and profiled
- [ ] At least 3 Tier 2 (indirect) competitors included
- [ ] Feature matrix verified by actually using each product (not just reading marketing)
- [ ] UX scores based on hands-on evaluation, not assumptions
- [ ] Pricing data current (checked within last 30 days)
- [ ] Screenshots captured for all notable patterns
- [ ] Data sources documented for every claim
- [ ] Insights tagged and stored in Memoire research system
- [ ] Strategic recommendations are specific and actionable (not "improve onboarding" but "add guided tour for first 3 tasks within 30 days")
- [ ] Report reviewed for confirmation bias — are we being honest about competitor strengths?

---

## Workflow Summary

```
TRIGGER: User needs competitive analysis

1. IDENTIFY
   → Classify competitors into Tier 1-4
   → Store in competitor registry

2. SCOPE
   → Use decision table to pick analysis type
   → Define deliverables and timeline

3. COLLECT
   → Gather data from public sources
   → Run technical analysis tools
   → Hands-on product evaluation

4. ANALYZE
   → Build feature matrix with weighted scores
   → Run UX benchmarking (heuristic + task-based)
   → Create positioning map
   → Analyze pricing architecture
   → Audit design patterns

5. SYNTHESIZE
   → Store insights in Memoire research engine
   → Run gap analysis, differentiation analysis, emerging feature detection
   → Generate SWOT per competitor
   → Calculate competitive scores

6. OUTPUT
   → Generate specs (ComponentSpec, DataVizSpec, PageSpec)
   → Create reports (executive brief or full report)
   → Set up monitoring cadence

7. ACT
   → Present strategic recommendations
   → Prioritize actions for next 90 days
   → Feed into product roadmap decisions
```
