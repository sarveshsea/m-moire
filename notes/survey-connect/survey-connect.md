---
name: Survey Connect
description: >
  Survey platform integration for Memoire. Import responses from Typeform,
  Google Forms, SurveyMonkey, Airtable, and CSV exports. Covers API
  authentication, response fetching, column detection, NPS calculation,
  open-ended response clustering, rating distribution analysis, and
  cross-tabulation. Outputs feed into Memoire research pipeline.
activateOn: research-to-dashboard
freedomLevel: high
category: connect
tags:
  - survey
  - typeform
  - google-forms
  - surveymonkey
  - airtable
  - csv
  - import
  - nps
  - ratings
---

# Survey Connect — Memoire Integration Skill

This skill drives survey data ingestion from multiple platforms into
Memoire's research pipeline. Covers API integrations, CSV parsing, response
analysis, and insight extraction from structured survey data.

---

## Quick Reference — Platform Decision Table

| Platform | Auth Method | Data Access | Best For |
|----------|------------|-------------|----------|
| Typeform | API token (`TYPEFORM_TOKEN`) | REST API, real-time | Conversational surveys, UX research |
| Google Forms | Google Sheets export to CSV | File-based | Quick internal surveys, free tier |
| SurveyMonkey | OAuth2 (`SURVEYMONKEY_TOKEN`) | REST API | Enterprise surveys, advanced logic |
| Airtable | API key (`AIRTABLE_TOKEN`) | REST API | Structured data, linked records |
| CSV file | N/A (local file) | Direct parse | Any platform export, offline data |

### When to Use Which

| Situation | Recommended Path |
|-----------|-----------------|
| Active Typeform survey, need ongoing sync | Typeform API integration |
| One-time Google Forms export | Download CSV, use CSV import |
| SurveyMonkey enterprise deployment | SurveyMonkey API integration |
| Survey data already in Airtable | Airtable API integration |
| Data exported from any platform | Universal CSV import |
| Multiple platforms, need unified view | Import all to CSV, then batch process |

---

## Typeform API Integration

### Authentication

Set the environment variable:
```bash
export TYPEFORM_TOKEN="tfp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Generate a personal access token at: `https://admin.typeform.com/account#/section/tokens`

Required scopes:
- `forms:read` — access form definitions
- `responses:read` — access response data

### Fetching Responses

```bash
# Import from a specific form
memi research from-survey --platform typeform --form-id abc123

# Import with date range
memi research from-survey --platform typeform --form-id abc123 --since 2026-03-01 --until 2026-03-28

# Import with label
memi research from-survey --platform typeform --form-id abc123 --label "Q1 User Satisfaction"

# List available forms
memi research from-survey --platform typeform --list
```

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /forms/{form_id}` | Fetch form structure (questions, types, logic) |
| `GET /forms/{form_id}/responses` | Fetch all responses with pagination |
| `GET /forms/{form_id}/responses?since={date}` | Fetch responses after a date |
| `GET /forms/{form_id}/responses?completed=true` | Only completed responses |

### Response Mapping

Typeform question types map to Memoire insight categories:

| Typeform Type | Memoire Category | Analysis Method |
|---------------|-----------------|-----------------|
| `opinion_scale` | rating | Rating distribution |
| `rating` | rating | Rating distribution |
| `nps` | nps | NPS score calculation |
| `multiple_choice` | categorical | Frequency distribution |
| `dropdown` | categorical | Frequency distribution |
| `yes_no` | boolean | Binary split analysis |
| `long_text` | open-ended | Text clustering |
| `short_text` | open-ended | Text clustering |
| `number` | numeric | Statistical summary |
| `ranking` | ordinal | Rank-order analysis |

### Rate Limits

Typeform API rate limits: 2 requests per second per token.
The connector handles pagination automatically with appropriate delays.

---

## Google Forms Integration

Google Forms does not expose a public API for response data. The standard
path is through Google Sheets.

### Export Workflow

```
1. Open Google Form -> Responses tab -> Link to Sheets
2. In Google Sheets -> File -> Download -> CSV (.csv)
3. Import the CSV into Memoire:

memi research from-survey --platform csv --file responses.csv --label "Onboarding Survey"
```

### Google Sheets API Path (Advanced)

For automated pipelines, use the Google Sheets API:

```bash
export GOOGLE_SHEETS_API_KEY="AIzaXXXXXXXXXXXXXXXXXXXXX"
memi research from-survey --platform google-sheets --sheet-id 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms
```

### Column Detection for Google Forms CSV

Google Forms CSV exports follow a predictable structure:
- Row 1: Question text as column headers
- Column 1: Timestamp
- Remaining columns: One per question

The engine detects question types by inspecting values:
- All numeric (1-5 or 1-10): rating scale
- "Yes" / "No" values: boolean
- Numbers 0-10 with NPS-style question text: NPS
- Comma-separated values in cells: multi-select
- Free text: open-ended

---

## SurveyMonkey API Integration

### Authentication

```bash
export SURVEYMONKEY_TOKEN="bearer xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Generate at: `https://developer.surveymonkey.com/apps/`

Required scopes:
- `surveys_read` — access survey definitions
- `responses_read` — access response data
- `responses_read_detail` — access individual response details

### Fetching Responses

```bash
# Import from a specific survey
memi research from-survey --platform surveymonkey --survey-id 123456789

# List available surveys
memi research from-survey --platform surveymonkey --list

# Import with filtering
memi research from-survey --platform surveymonkey --survey-id 123456789 --status completed
```

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v3/surveys` | List all surveys |
| `GET /v3/surveys/{id}/details` | Full survey structure with questions |
| `GET /v3/surveys/{id}/responses/bulk` | Bulk response export |
| `GET /v3/collectors/{id}/responses/bulk` | Responses by collector |

### Response Mapping

| SurveyMonkey Type | Memoire Category | Analysis |
|-------------------|-----------------|----------|
| `single_choice` | categorical | Frequency distribution |
| `multiple_choice` | categorical | Multi-select frequency |
| `matrix` | matrix | Cross-tabulation |
| `open_ended` | open-ended | Text clustering |
| `demographic` | context | Segmentation data |
| `star_rating` | rating | Rating distribution |
| `slider` | numeric | Statistical summary |
| `net_promoter_score` | nps | NPS calculation |
| `ranking` | ordinal | Rank-order analysis |
| `file_upload` | attachment | Skip (log warning) |

### Rate Limits

SurveyMonkey API: 120 requests per minute per OAuth token.
Bulk response endpoints return up to 100 responses per page.

---

## Airtable API Integration

### Authentication

```bash
export AIRTABLE_TOKEN="patXXXXXXXXXXXXXX.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

Generate a personal access token at: `https://airtable.com/create/tokens`

Required scopes:
- `data.records:read` — read record data

### Fetching Responses

```bash
# Import from a specific base and table
memi research from-survey --platform airtable --base-id appXXXXXXXXXXXXX --table-name "Survey Responses"

# With view filter
memi research from-survey --platform airtable --base-id appXXXXXXXXXXXXX --table-name "Survey Responses" --view "Completed Only"

# List available bases
memi research from-survey --platform airtable --list
```

### API Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `GET /v0/meta/bases` | List accessible bases |
| `GET /v0/meta/bases/{baseId}/tables` | List tables in a base |
| `GET /v0/{baseId}/{tableIdOrName}` | Fetch records with pagination |

### Field Type Mapping

| Airtable Field | Memoire Category | Analysis |
|----------------|-----------------|----------|
| `singleSelect` | categorical | Frequency distribution |
| `multipleSelects` | categorical | Multi-select frequency |
| `rating` | rating | Rating distribution |
| `number` | numeric | Statistical summary |
| `singleLineText` | open-ended | Text clustering (short) |
| `multilineText` | open-ended | Text clustering (long) |
| `checkbox` | boolean | Binary split |
| `date` | temporal | Time-series grouping |
| `email` | pii | Strip before storage |
| `phoneNumber` | pii | Strip before storage |

### Rate Limits

Airtable API: 5 requests per second per base.
Records endpoint returns up to 100 records per page with `offset` pagination.

---

## Universal CSV Column Detection

Memoire's research engine includes automatic column type detection for
CSV imports. This works regardless of which platform exported the CSV.

### Detection Algorithm

```
For each column in the CSV:

1. Sample first 100 non-empty values

2. Check for PII patterns:
   - Email regex -> flag as PII, strip
   - Phone regex -> flag as PII, strip
   - Name-like (first + last pattern) -> flag as PII, warn

3. Detect data type:
   - All values are integers 0-10 and question contains "recommend" or "likely"
     -> NPS
   - All values are integers in a small range (1-5, 1-7, 1-10)
     -> Rating scale
   - All values match "Yes"/"No" or "True"/"False"
     -> Boolean
   - All values are from a set of < 20 unique options
     -> Categorical (single-select)
   - Values contain commas or semicolons within cells
     -> Categorical (multi-select)
   - All values are numeric (int or float)
     -> Numeric
   - All values match date patterns
     -> Temporal
   - Average word count > 10
     -> Open-ended (long text)
   - Average word count <= 10 and unique ratio > 0.8
     -> Open-ended (short text)
   - Default
     -> Open-ended
```

### CSV Import Command

```bash
# Basic CSV import
memi research from-survey --platform csv --file responses.csv

# With label and metadata
memi research from-survey --platform csv --file responses.csv --label "Q1 NPS Survey"

# Skip specific columns
memi research from-survey --platform csv --file responses.csv --skip-columns "Email,Name,Phone"

# Force column types
memi research from-survey --platform csv --file responses.csv --column-types "Q1:nps,Q2:rating,Q3:open-ended"

# Batch import multiple CSVs
memi research from-survey --platform csv --batch ./survey-exports/
```

---

## NPS Score Calculation and Analysis

### Standard NPS Calculation

```
NPS Question: "How likely are you to recommend [product] to a friend or colleague?"
Scale: 0-10

Classification:
  9-10 = Promoter
  7-8  = Passive
  0-6  = Detractor

NPS Score = (% Promoters) - (% Detractors)
Range: -100 to +100
```

### NPS Benchmarks

| Score Range | Classification | Interpretation |
|-------------|---------------|----------------|
| 70+ | World-class | Exceptional loyalty, strong organic growth |
| 50-69 | Excellent | Strong advocacy, healthy growth |
| 30-49 | Good | More promoters than detractors, room to grow |
| 0-29 | Needs improvement | Roughly balanced, significant detractor population |
| Below 0 | Critical | More detractors than promoters, churn risk |

### NPS Analysis Output

```json
{
  "nps": {
    "score": 42,
    "promoters": { "count": 156, "percentage": 52.0 },
    "passives": { "count": 84, "percentage": 28.0 },
    "detractors": { "count": 60, "percentage": 20.0 },
    "totalResponses": 300,
    "confidence": 0.95,
    "marginOfError": 3.2
  },
  "segments": [
    { "segment": "Enterprise", "nps": 58, "n": 120 },
    { "segment": "SMB", "nps": 31, "n": 130 },
    { "segment": "Free tier", "nps": 12, "n": 50 }
  ],
  "trend": [
    { "period": "2026-Q1", "nps": 42 },
    { "period": "2025-Q4", "nps": 38 },
    { "period": "2025-Q3", "nps": 35 }
  ]
}
```

---

## Open-Ended Response Clustering

### Clustering Protocol

For open-ended (free text) responses:

```
STEP 1 — Clean
  Remove empty responses, "N/A", "none", single-character responses.
  Normalize whitespace, lowercase for comparison (preserve original for display).

STEP 2 — Extract Key Phrases
  For each response:
    - Extract noun phrases (the primary topics)
    - Extract verb phrases (what users want to do)
    - Extract sentiment-bearing phrases

STEP 3 — Cluster by Similarity
  Group responses into clusters based on:
    - Shared key phrases (exact or near match)
    - Semantic similarity (topic overlap)
  Target: 5-15 clusters for most surveys.
  Each cluster gets a label derived from the most common phrase.

STEP 4 — Score Clusters
  For each cluster:
    - Count: how many responses
    - Percentage: of total open-ended responses
    - Average sentiment: -2 to +2
    - Representative quotes: top 3 by centrality

STEP 5 — Map to Insight Categories
  Each cluster maps to one Memoire insight category:
    - Complaint cluster -> pain-point
    - Wish/request cluster -> feature-request
    - Praise cluster -> strength
    - Process description cluster -> behavior
    - Suggestion cluster -> need
```

### Cluster Output Format

```json
{
  "clusters": [
    {
      "id": "cluster-001",
      "label": "Export workflow complaints",
      "insightCategory": "pain-point",
      "count": 34,
      "percentage": 22.4,
      "sentiment": -1.2,
      "representativeQuotes": [
        "The export feature is practically unusable for large datasets",
        "I have to export three times because it keeps timing out",
        "Why can I not schedule an automatic export?"
      ],
      "keyPhrases": ["export", "timeout", "schedule", "large datasets"]
    }
  ]
}
```

---

## Rating Distribution Analysis

### Statistical Summary

For each rating-scale question, compute:

```
- Mean: average score
- Median: middle value
- Mode: most frequent value
- Standard deviation: spread of responses
- Skewness: positive = clustered low, negative = clustered high
- Distribution: count per rating value
- Top-box: percentage selecting highest 1-2 values
- Bottom-box: percentage selecting lowest 1-2 values
```

### Benchmark Comparison

| Metric | Poor | Below Average | Average | Good | Excellent |
|--------|------|--------------|---------|------|-----------|
| Mean (1-5 scale) | < 2.5 | 2.5-3.0 | 3.0-3.5 | 3.5-4.0 | > 4.0 |
| Mean (1-7 scale) | < 3.5 | 3.5-4.2 | 4.2-5.0 | 5.0-5.8 | > 5.8 |
| Mean (1-10 scale) | < 5.0 | 5.0-6.0 | 6.0-7.0 | 7.0-8.0 | > 8.0 |
| Top-box % | < 20% | 20-35% | 35-50% | 50-65% | > 65% |
| Bottom-box % | > 30% | 20-30% | 10-20% | 5-10% | < 5% |

---

## Cross-Tabulation Patterns

### When to Cross-Tabulate

Run cross-tabulation when:
- Survey includes demographic or segment questions
- You need to understand how different groups respond differently
- NPS or satisfaction varies and you need to find the driver

### Cross-Tab Protocol

```
1. Select independent variable (segment, role, tenure, plan tier)
2. Select dependent variable (NPS, satisfaction rating, feature preference)
3. Build contingency table
4. Calculate:
   - Per-segment mean/distribution for the dependent variable
   - Chi-squared test for categorical variables (is the difference significant?)
   - Effect size (how large is the difference?)
5. Flag segments with statistically significant differences
```

### Output Format

```json
{
  "crossTab": {
    "independent": "Plan Tier",
    "dependent": "NPS Score",
    "segments": [
      { "segment": "Free", "mean": 12, "n": 50, "distribution": { "promoter": 20, "passive": 30, "detractor": 50 } },
      { "segment": "Pro", "mean": 48, "n": 120, "distribution": { "promoter": 55, "passive": 25, "detractor": 20 } },
      { "segment": "Enterprise", "mean": 62, "n": 80, "distribution": { "promoter": 65, "passive": 20, "detractor": 15 } }
    ],
    "significant": true,
    "chiSquared": 34.7,
    "pValue": 0.001
  }
}
```

---

## Privacy and PII Handling

### PII Detection

The connector scans for and flags these PII types before storage:

| PII Type | Detection Method | Action |
|----------|-----------------|--------|
| Email addresses | Regex: `[\w.+-]+@[\w-]+\.[\w.]+` | Strip, replace with `[email-removed]` |
| Phone numbers | Regex: `\+?\d[\d\s\-()]{7,}` | Strip, replace with `[phone-removed]` |
| Full names | Column header contains "name" + values match name patterns | Warn user, do not auto-strip |
| IP addresses | Regex: `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}` | Strip, replace with `[ip-removed]` |
| Physical addresses | Column header contains "address" | Warn user, do not auto-strip |

### Privacy Protocol

```
1. SCAN — Detect PII columns on import
2. WARN — Display detected PII columns to the user
3. STRIP — Remove PII columns from stored data (unless --keep-pii flag)
4. LOG — Record which columns were stripped in metadata
5. VERIFY — Confirm no PII in stored insights after processing
```

### Data Storage

Survey data is stored locally in `.memoire/research/`:
- Raw responses are never sent to external services
- PII is stripped before insight extraction
- Original files remain untouched (the connector reads, not modifies)

---

## Integration with Memoire Pipeline

### Data Flow

```
SURVEY PLATFORM (Typeform / Google Forms / SurveyMonkey / Airtable / CSV)
  |
  v
FETCH — API call or file read
  |
  v
DETECT — column type detection, PII scan
  |
  v
STRIP — remove PII columns
  |
  v
ANALYZE — per-question analysis based on detected type
  |  - Rating: distribution + statistics
  |  - NPS: score + segments
  |  - Categorical: frequency counts
  |  - Open-ended: clustering + sentiment
  |  - Boolean: binary split
  v
EXTRACT — convert analysis results to Memoire insights
  |
  v
STORE — write to .memoire/research/insights/
  |
  v
SYNTHESIZE — merge with interview data, web research, other sources
  |  (memi research synthesize)
  v
REPORT — generate research report
  |  (memi research report)
  v
DASHBOARD — generate data visualization specs
     (memi compose "build research dashboard from survey data")
```

### Storage Structure

```
.memoire/
  research/
    surveys/
      q1-nps-survey.responses.json     # parsed responses (PII stripped)
      q1-nps-survey.meta.json           # metadata (platform, date, question map)
      q1-nps-survey.analysis.json       # per-question analysis results
    insights/
      q1-nps-survey.insights.json       # extracted insights
```

### Tagging Convention

```
Insight tagging for survey data:
  source: "survey"
  platform: "typeform" | "google-forms" | "surveymonkey" | "airtable" | "csv"
  surveyId: "{platform-specific-id}"
  label: "{user-provided label}"
  questionType: "nps" | "rating" | "categorical" | "open-ended" | "boolean"
  questionText: "{original question text}"
  confidence: 0.0-1.0 (based on sample size)
  date: "{ISO date}"
```

---

## Workflow Summary

```
TRIGGER: User needs to import and analyze survey data

1. CONNECT
   -> Identify platform (Typeform, Google Forms, SurveyMonkey, Airtable, CSV)
   -> Authenticate (API token or file path)
   -> Fetch form structure and responses

2. DETECT
   -> Auto-detect column/question types
   -> Scan for PII, warn and strip
   -> Map platform-specific types to Memoire categories

3. ANALYZE
   -> Rating questions: distribution, mean, top-box, bottom-box
   -> NPS questions: score, segment breakdown, trend
   -> Categorical questions: frequency distribution, cross-tab
   -> Open-ended questions: clustering, sentiment, key phrases
   -> Boolean questions: binary split percentages

4. EXTRACT
   -> Convert analysis results to Memoire insight objects
   -> Tag with source, platform, question metadata
   -> Calculate confidence based on sample size

5. STORE
   -> Write responses, analysis, and insights to .memoire/research/
   -> Maintain PII-free data only

6. SYNTHESIZE
   -> Merge survey insights with interview and web research data
   -> Cross-validate findings across sources
   -> Feed into research-to-dashboard pipeline

7. REPORT
   -> Generate survey analysis report
   -> Create NPS dashboard specs
   -> Build satisfaction trend visualizations
```
