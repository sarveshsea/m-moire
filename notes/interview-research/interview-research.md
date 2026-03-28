---
name: Interview Research
description: >
  User interview and transcript analysis. Covers parsing speaker-labeled
  transcripts, extracting pain points, goals, behaviors, needs, feature
  requests, and workarounds. Includes sentiment analysis at word, sentence,
  and aggregate levels, plus persona generation from qualitative data.
  Outputs feed directly into Memoire research synthesis and spec pipelines.
activateOn: research-to-dashboard
freedomLevel: high
category: research
tags:
  - interview
  - transcript
  - qualitative
  - user-research
  - sentiment
  - persona
  - pain-points
  - synthesis
---

# Interview Research — Memoire Research Skill

This skill drives rigorous analysis of user interviews from raw transcript
through actionable insights and generated personas. Every section maps to
concrete deliverables that feed Memoire's research, spec, and codegen
pipelines.

---

## Quick Reference — Decision Table

Use this table to decide which analysis to run based on available data.

| Data Type | Analysis to Run | Output | Time Estimate |
|-----------|----------------|--------|---------------|
| Single transcript (raw text) | Full insight extraction | insights.json + summary | 15 min |
| Single transcript (speaker-labeled) | Insight extraction + speaker attribution | insights.json with speaker tags | 20 min |
| Multiple transcripts (same topic) | Cross-transcript synthesis | themes.json + frequency matrix | 45 min |
| Multiple transcripts (mixed topics) | Topic clustering + per-topic synthesis | topic-clusters.json + insights per cluster | 1 hour |
| Transcript + survey data | Triangulation analysis | validated-insights.json with confidence scores | 1 hour |
| Transcript + existing personas | Persona validation and enrichment | updated-personas.json with new quotes | 30 min |
| Short interview notes (not full transcript) | Quick insight scan | insights.json (lower confidence) | 10 min |
| Video recording link | Transcript generation prompt + analysis | transcript.txt + insights.json | 30 min |
| Usability test recording | Task-based analysis + insight extraction | task-scores.json + insights.json | 45 min |

### Priority Framework

When time is limited, extract insights in this order:

1. **Pain points** — highest signal, most actionable
2. **Goals and motivations** — frame the problem space
3. **Current behaviors and workarounds** — reveal unmet needs
4. **Feature requests** — direct input (but validate against pain points)
5. **Sentiment patterns** — emotional intensity highlights critical areas
6. **Persona data points** — demographics, context, environment

---

## Transcript Format Support

Memoire handles four transcript formats. The parser auto-detects format
on ingest.

### Format 1 — Plain Text

Unstructured block of text with no speaker labels or timestamps.

```
The user mentioned they find it frustrating to export data.
They said they usually copy-paste into a spreadsheet instead.
```

Detection: No consistent speaker labels, no timestamp patterns.
Limitation: Cannot attribute statements to specific speakers.

### Format 2 — Timestamped

Lines prefixed with timestamps in `HH:MM:SS` or `MM:SS` format.

```
00:01:23  So the main problem is I can never find the export button.
00:01:45  I end up just copying everything into Google Sheets manually.
00:02:10  It takes me about twenty minutes every Friday.
```

Detection: Lines matching `^\d{1,2}:\d{2}(:\d{2})?\s+`.
Benefit: Enables time-based analysis (e.g., when frustration peaks).

### Format 3 — Speaker-Labeled

Each line or paragraph prefixed with a speaker name.

```
Interviewer: Can you walk me through your typical Friday workflow?
Participant: Sure. I start by pulling up the dashboard, then I need to export
  the weekly numbers. That is where it gets painful.
Interviewer: What do you mean by painful?
Participant: The export button is buried three levels deep. I usually just
  copy-paste the table into a spreadsheet.
```

Detection: Lines matching `^[A-Za-z\s]+:\s`.
Benefit: Speaker attribution enables interviewer/participant separation.

### Format 4 — Q&A Structured

Explicit question-and-answer pairs, often from structured interviews.

```
Q: How often do you use the export feature?
A: Almost every Friday. It is part of my weekly reporting process.

Q: What is the most frustrating part of that process?
A: Finding the export button. It moves around depending on which view
   I am in. Sometimes it is in the menu, sometimes it is a toolbar icon.
```

Detection: Lines matching `^Q:\s` and `^A:\s` in alternating pattern.
Benefit: Direct question-to-answer mapping for structured analysis.

### Ingestion Command

```bash
memi research from-transcript interview.txt
memi research from-transcript --label "Sprint 12 User Test" recording.txt
memi research from-transcript --format speaker-labeled --participants "P1:Sarah,P2:Mike" session.txt
memi research from-transcript --batch ./transcripts/
```

---

## Insight Extraction Methodology

### Insight Categories

Every extracted insight is classified into one of these categories.

| Category | Code | Description | Signal Strength |
|----------|------|-------------|-----------------|
| Pain Point | `pain-point` | Frustration, difficulty, blocker, complaint | Highest |
| Goal | `goal` | Desired outcome, aspiration, success criteria | High |
| Behavior | `behavior` | Current action, habit, routine, process | High |
| Need | `need` | Requirement, expectation, must-have | High |
| Feature Request | `feature-request` | Specific functionality ask | Medium |
| Workaround | `workaround` | Hack, alternative path, duct-tape solution | High |
| Mental Model | `mental-model` | How the user thinks about the domain | Medium |
| Emotion | `emotion` | Expressed feeling (frustration, delight, anxiety) | Medium |
| Context | `context` | Environmental detail, tool stack, team structure | Low |
| Quote | `quote` | Verbatim statement worth preserving for reports | Variable |

### Extraction Protocol

For each transcript, execute this extraction pass:

```
PASS 1 — Pain Points
  Scan for: frustration language, complaints, blockers, negative emotion
  Markers: "frustrating", "annoying", "I wish", "I can't", "it takes too long",
           "the worst part", "I hate", "it breaks", "doesn't work", "confusing"
  For each pain point:
    - Verbatim quote (exact words)
    - Paraphrased insight (1 sentence)
    - Severity: critical | major | minor
    - Frequency indicator: does the user mention it more than once?
    - Context: what were they trying to do when they hit this?

PASS 2 — Goals and Motivations
  Scan for: desired outcomes, success language, aspirations
  Markers: "I want to", "I need to", "ideally", "if I could", "my goal is",
           "I am trying to", "what would help is", "success looks like"
  For each goal:
    - Verbatim quote
    - Paraphrased goal statement
    - Priority: primary | secondary | tertiary
    - Relates to pain point: {pain-point-id} or none

PASS 3 — Behaviors and Workflows
  Scan for: process descriptions, routines, step-by-step accounts
  Markers: "I usually", "every day I", "my process is", "first I", "then I",
           "the way I do it", "I start by", "after that"
  For each behavior:
    - Workflow steps (ordered list)
    - Frequency: daily | weekly | monthly | ad-hoc
    - Tool mentions: what software/tools are involved
    - Pain points within the workflow (cross-reference)

PASS 4 — Needs and Requirements
  Scan for: must-haves, expectations, requirements
  Markers: "I need", "it has to", "essential", "requirement", "must have",
           "deal-breaker", "non-negotiable", "important that"
  For each need:
    - Paraphrased need statement
    - Category: functional | performance | usability | reliability
    - Priority: must-have | should-have | nice-to-have

PASS 5 — Feature Requests
  Scan for: specific functionality suggestions
  Markers: "it would be great if", "can you add", "I wish there was",
           "what if it could", "a button that", "an option to"
  For each request:
    - Paraphrased request
    - Underlying need (what problem does this solve?)
    - Validate: does this address a documented pain point?

PASS 6 — Workarounds
  Scan for: alternative solutions, hacks, manual processes
  Markers: "instead I", "what I do is", "I found a way", "hack",
           "I use X instead", "copy-paste", "manually", "spreadsheet"
  For each workaround:
    - What they do instead
    - What they are working around (cross-reference pain point)
    - Effort level: low | medium | high
    - This is strong signal — workarounds reveal unmet needs
```

### Insight JSON Schema

Each extracted insight produces a JSON object:

```json
{
  "id": "ins-001",
  "category": "pain-point",
  "statement": "Export button is buried three levels deep in the menu",
  "verbatimQuote": "The export button is buried three levels deep. I usually just copy-paste.",
  "speaker": "P1",
  "timestamp": "00:02:10",
  "severity": "major",
  "frequency": 3,
  "relatedInsights": ["ins-004", "ins-007"],
  "tags": ["export", "navigation", "workflow-blocker"],
  "confidence": 0.9,
  "source": {
    "file": "sprint-12-user-test.txt",
    "label": "Sprint 12 User Test",
    "date": "2026-03-25"
  }
}
```

---

## Sentiment Analysis

### Word-Level Sentiment

Identify emotionally charged words and phrases within each statement.

| Sentiment | Indicator Words |
|-----------|----------------|
| Strongly negative | hate, terrible, awful, impossible, nightmare, broken, worst |
| Negative | frustrating, annoying, confusing, slow, difficult, clunky |
| Neutral | okay, fine, normal, standard, typical, usual |
| Positive | easy, nice, helpful, good, smooth, intuitive, clear |
| Strongly positive | love, amazing, brilliant, fantastic, perfect, delightful |

### Sentence-Level Sentiment

Score each participant statement on a -2 to +2 scale:

```
-2  Strongly negative — clear frustration, anger, or resignation
-1  Negative — mild complaint, difficulty, dissatisfaction
 0  Neutral — factual statement, neither positive nor negative
+1  Positive — mild satisfaction, appreciation, ease
+2  Strongly positive — delight, enthusiasm, strong preference
```

### Aggregate Sentiment Analysis

After scoring all statements, compute:

```
Per-topic sentiment:
  Group statements by topic tag
  Average sentiment score per topic
  Identify: most negative topic, most positive topic, most polarizing topic

Per-participant sentiment:
  Average sentiment score per participant
  Sentiment trajectory: does sentiment improve or decline over the interview?
  Identify: most frustrated participant, most satisfied participant

Overall session sentiment:
  Distribution: what % of statements are negative vs neutral vs positive?
  Sentiment arc: how does sentiment change from beginning to end?
  Key inflection points: where does sentiment shift dramatically?
```

### Sentiment Output Format

```json
{
  "aggregate": {
    "mean": -0.4,
    "distribution": {
      "stronglyNegative": 0.08,
      "negative": 0.32,
      "neutral": 0.35,
      "positive": 0.20,
      "stronglyPositive": 0.05
    },
    "topNegativeTopics": ["export", "navigation", "permissions"],
    "topPositiveTopics": ["dashboard", "onboarding", "search"]
  },
  "byParticipant": [
    {
      "speaker": "P1",
      "mean": -0.6,
      "statementCount": 42,
      "trajectory": "declining"
    }
  ],
  "byTopic": [
    {
      "topic": "export",
      "mean": -1.3,
      "statementCount": 8,
      "dominantCategory": "pain-point"
    }
  ]
}
```

---

## Persona Generation from Interview Data

### Data Requirements

To generate a persona from interview data, collect across multiple
transcripts:

| Data Point | Minimum Sources | How to Extract |
|------------|----------------|----------------|
| Role / job title | 3+ participants | Direct mention or interviewer notes |
| Daily tasks | 3+ participants | Behavior extraction pass |
| Goals | 3+ participants | Goals extraction pass |
| Pain points | 5+ mentions across participants | Pain point extraction pass |
| Tools used | 3+ participants | Context extraction pass |
| Experience level | 3+ participants | Direct mention or inferred from language |
| Decision criteria | 2+ participants | Needs extraction pass |
| Quotes | 5+ strong quotes | Quote extraction pass |

### Persona Generation Protocol

```
STEP 1 — Cluster Participants
  Group participants by:
    - Role similarity (same job function)
    - Goal similarity (pursuing same outcomes)
    - Behavior similarity (similar workflows)
  Each cluster becomes a candidate persona.
  Minimum cluster size: 3 participants.

STEP 2 — Extract Persona Attributes
  For each cluster:
    - Name: fictional, representative of the demographic
    - Role: most common job title in the cluster
    - Experience: average experience level
    - Goals: top 3 goals (by frequency across cluster)
    - Pain points: top 5 pain points (by frequency and severity)
    - Behaviors: top 3 behavior patterns
    - Tools: most common tool stack
    - Quotes: 3-5 strongest verbatim quotes from cluster members
    - Needs: top 3 prioritized needs
    - Frustration level: aggregate sentiment score

STEP 3 — Validate Persona
  Check:
    - Does this persona represent 20%+ of participants? (if not, may be an edge case)
    - Are the goals internally consistent? (conflicting goals = may be two personas)
    - Do the pain points connect to the goals? (disconnected = weak persona)
    - Can you write a 1-paragraph day-in-the-life story? (if not, needs more data)

STEP 4 — Output Persona Card
  Generate as Memoire ComponentSpec for rendering.
```

### Persona JSON Schema

```json
{
  "id": "persona-001",
  "name": "Sarah Chen",
  "role": "Product Manager",
  "experience": "3-5 years",
  "archetype": "The Data-Driven Decision Maker",
  "description": "Sarah leads a cross-functional team and relies on data exports to build weekly stakeholder reports. She values efficiency and predictability in her tools.",
  "goals": [
    { "goal": "Generate weekly reports in under 30 minutes", "priority": "primary" },
    { "goal": "Share dashboards with stakeholders without manual formatting", "priority": "secondary" },
    { "goal": "Track team velocity across sprints", "priority": "tertiary" }
  ],
  "painPoints": [
    { "pain": "Export button location changes between views", "severity": "critical", "frequency": 8 },
    { "pain": "Exported data requires manual cleanup in spreadsheets", "severity": "major", "frequency": 6 },
    { "pain": "No way to schedule recurring exports", "severity": "major", "frequency": 4 }
  ],
  "behaviors": [
    "Checks dashboard every morning before standup",
    "Exports data to Google Sheets every Friday for weekly report",
    "Screenshots charts because export does not preserve formatting"
  ],
  "tools": ["Google Sheets", "Slack", "Jira", "Confluence"],
  "quotes": [
    "I spend twenty minutes every Friday just wrestling with exports.",
    "If I could just schedule this to land in my inbox, that would save my Fridays.",
    "I love the dashboard view — I just wish I could share it as-is."
  ],
  "sentimentProfile": {
    "overall": -0.4,
    "topFrustration": "export workflow",
    "topDelight": "dashboard visualization"
  },
  "sourceParticipants": ["P1", "P4", "P7", "P9", "P12"],
  "confidence": 0.85
}
```

---

## Best Practices for User Interview Analysis

### Before Analysis

- **Read the full transcript once before extracting** — context matters.
  A statement that sounds like a pain point in isolation may be a joke or
  a resolved issue when read in context.
- **Separate interviewer from participant** — only extract insights from
  participant statements. Interviewer leading questions are bias signals,
  not data.
- **Note the interview context** — was this a discovery interview, usability
  test, or support call? The context affects how to weight the data.

### During Extraction

- **Preserve verbatim quotes** — paraphrasing loses nuance. Always store
  the exact words alongside your interpreted insight.
- **Do not infer beyond the data** — if a participant says "it is a bit slow",
  code it as a minor pain point, not a critical one. Let frequency across
  participants determine severity.
- **Cross-reference within the same transcript** — if a participant mentions
  the same issue three times, that is stronger signal than three participants
  mentioning it once each.
- **Watch for leading questions** — if the interviewer asked "Do you find the
  export frustrating?", the response carries less weight than an unprompted
  complaint.

### After Extraction

- **Triangulate across data sources** — interview insights gain confidence
  when corroborated by survey data, analytics, or support tickets.
- **Quantify qualitative data** — count frequencies, calculate severity
  distributions, track sentiment scores. Qualitative does not mean
  unstructured.
- **Report uncertainty** — single-source insights should be flagged as
  low confidence. Use the confidence field in every insight JSON.

### Common Anti-Patterns

| Anti-Pattern | Problem | Correction |
|-------------|---------|------------|
| Cherry-picking quotes | Confirms existing bias | Extract all insights first, then select representative quotes |
| Ignoring positive feedback | Misses what to preserve and amplify | Extract positive insights with same rigor |
| Over-weighting articulate participants | Louder voices dominate | Weight by frequency across participants, not eloquence |
| Treating feature requests as requirements | Users describe solutions, not problems | Always trace request back to underlying pain point |
| Skipping context and environment data | Loses the "why" behind behaviors | Always extract context tags and environmental details |
| One-pass analysis | Misses patterns that emerge on re-reading | Run all six extraction passes separately |

---

## Integration with Memoire Pipeline

### End-to-End Flow

```
TRANSCRIPT INPUT
  |
  v
PARSE — detect format, split by speaker, extract timestamps
  |
  v
EXTRACT — run 6-pass insight extraction
  |
  v
SCORE — sentiment analysis (word, sentence, aggregate)
  |
  v
TAG — auto-tag insights with topics, categories, severity
  |
  v
STORE — write insights.json to .memoire/research/insights/
  |
  v
SYNTHESIZE — cross-reference with existing insights from other sources
  |  (memi research synthesize)
  v
PERSONA — generate persona cards from clustered insights
  |  (memi research persona --from-insights)
  v
SPEC — generate ComponentSpecs for persona cards, insight dashboards
  |  (memi spec component PersonaCard)
  v
CODEGEN — generate React components from specs
  |  (memi generate PersonaCard)
  v
PREVIEW — render in localhost preview gallery
     (memi preview)
```

### Storage Conventions

```
.memoire/
  research/
    transcripts/
      sprint-12-user-test.txt          # raw transcript
      sprint-12-user-test.meta.json    # metadata (date, participants, label)
    insights/
      sprint-12-user-test.insights.json  # extracted insights
    sentiment/
      sprint-12-user-test.sentiment.json # sentiment analysis
    personas/
      persona-001.json                   # generated persona
      persona-002.json
    synthesis/
      themes.json                        # cross-source themes
      frequency-matrix.json              # insight frequency counts
```

### Tagging Convention for Research Engine

```
Insight tagging:
  source: "interview"
  transcript: "{filename}"
  label: "{user-provided label}"
  speaker: "{speaker-id}"
  category: "pain-point" | "goal" | "behavior" | "need" | "feature-request" | "workaround"
  severity: "critical" | "major" | "minor"
  topic: "{auto-detected topic tag}"
  confidence: 0.0-1.0
  date: "{ISO date}"
```

### CLI Commands

```bash
# Basic transcript analysis
memi research from-transcript interview.txt

# With label and metadata
memi research from-transcript --label "Sprint 12 User Test" recording.txt

# Specify format explicitly (auto-detect is default)
memi research from-transcript --format speaker-labeled session.txt

# Batch process a directory of transcripts
memi research from-transcript --batch ./transcripts/

# Named participants for speaker-labeled transcripts
memi research from-transcript --participants "Interviewer:Alex,P1:Sarah,P2:Mike" session.txt

# Generate personas from accumulated insights
memi research persona --from-insights --min-sources 3

# Synthesize across all interview insights
memi research synthesize --source interview

# Full pipeline: transcript to dashboard
memi compose "analyze user interviews and build research dashboard"
```

### Output Formats

| Format | File | Contents |
|--------|------|----------|
| Insights JSON | `{name}.insights.json` | Array of insight objects with full metadata |
| Sentiment JSON | `{name}.sentiment.json` | Word, sentence, and aggregate sentiment data |
| Persona JSON | `persona-{id}.json` | Full persona card with goals, pains, behaviors, quotes |
| Markdown Summary | `{name}.summary.md` | Human-readable summary with key findings and quotes |
| Frequency Matrix | `frequency-matrix.json` | Cross-participant insight frequency counts |
| Themes JSON | `themes.json` | Clustered themes with supporting evidence counts |

---

## Workflow Summary

```
TRIGGER: User provides interview transcripts for analysis

1. INGEST
   -> Detect transcript format (plain, timestamped, speaker-labeled, Q&A)
   -> Parse into structured segments
   -> Store raw transcript and metadata

2. EXTRACT
   -> Run 6-pass extraction (pain points, goals, behaviors, needs, requests, workarounds)
   -> Classify each insight by category, severity, frequency
   -> Preserve verbatim quotes with attribution

3. ANALYZE
   -> Sentiment scoring (word, sentence, aggregate)
   -> Topic clustering
   -> Cross-reference within and across transcripts

4. SYNTHESIZE
   -> Merge with existing research insights
   -> Calculate confidence scores (multi-source = higher confidence)
   -> Generate frequency matrix and theme clusters

5. GENERATE
   -> Build persona cards from clustered participant data
   -> Create specs for insight dashboard components
   -> Generate code via Memoire codegen pipeline

6. REPORT
   -> Markdown summary with key findings
   -> Persona cards with supporting quotes
   -> Insight dashboard with filtering and sorting
   -> Feed into research-to-dashboard pipeline
```
