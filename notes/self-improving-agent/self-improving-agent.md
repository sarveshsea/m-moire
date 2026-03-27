---
name: self-improving-agent
description: "Captures learnings, errors, and corrections to enable continuous improvement. Use when: (1) A command or operation fails unexpectedly, (2) User corrects Claude ('No, that's wrong...', 'Actually...'), (3) User requests a capability that doesn't exist, (4) An external API or tool fails, (5) Claude realizes its knowledge is outdated or incorrect, (6) A better approach is discovered for a recurring task. Also review learnings before major tasks."
metadata:
---

# Self-Improving Agent

Log learnings and errors to markdown files for continuous improvement. Coding agents can later process these into fixes, and important learnings get promoted to project memory.

## Quick Reference

| Situation | Action |
|-----------|--------|
| Command/operation fails | Log to `.memoire/learnings/ERRORS.md` |
| User corrects you | Log to `.memoire/learnings/LEARNINGS.md` with category `correction` |
| User wants missing feature | Log to `.memoire/learnings/FEATURE_REQUESTS.md` |
| API/external tool fails | Log to `.memoire/learnings/ERRORS.md` with integration details |
| Knowledge was outdated | Log to `.memoire/learnings/LEARNINGS.md` with category `knowledge_gap` |
| Found better approach | Log to `.memoire/learnings/LEARNINGS.md` with category `best_practice` |
| Simplify/Harden recurring patterns | Log/update `.memoire/learnings/LEARNINGS.md` with `Source: simplify-and-harden` and a stable `Pattern-Key` |
| Similar to existing entry | Link with `**See Also**`, consider priority bump |
| Broadly applicable learning | Promote to `CLAUDE.md` and `.memoire/` files |
| Workflow improvements | Promote to `CLAUDE.md` or `.memoire/` agent configs |
| Tool gotchas | Promote to `CLAUDE.md` or `.memoire/` agent configs |
| Behavioral patterns | Promote to `CLAUDE.md` or `.memoire/` agent configs |

## Memoire Setup

Memoire is the primary platform for this skill. It uses project-level configuration with automatic skill loading via Notes.

### Installation

**Via Memoire Notes (recommended):**
```bash
memi notes install self-improving-agent
```

**Manual:**
Copy this Note folder into your project's `notes/` directory or install from a GitHub source:
```bash
memi notes install github:user/repo
```

Ported from the original self-improving-agent by peterskoett: https://github.com/peterskoett/self-improving-agent

### Project Structure

Memoire injects these files into every session:

```
.memoire/
├── CLAUDE.md              # Project facts, conventions, gotchas
├── notes/                 # Installed Notes (skill packs)
│   └── self-improving-agent/
│       ├── note.json
│       └── self-improving-agent.md
└── learnings/             # This skill's log files
    ├── LEARNINGS.md
    ├── ERRORS.md
    └── FEATURE_REQUESTS.md
```

### Create Learning Files

```bash
mkdir -p .memoire/learnings
```

Then create the log files:
- `LEARNINGS.md` — corrections, knowledge gaps, best practices
- `ERRORS.md` — command failures, exceptions
- `FEATURE_REQUESTS.md` — user-requested capabilities

### Promotion Targets

When learnings prove broadly applicable, promote them to project files:

| Learning Type | Promote To | Example |
|---------------|------------|---------|
| Behavioral patterns | `CLAUDE.md` | "Be concise, avoid disclaimers" |
| Workflow improvements | `CLAUDE.md` or `.memoire/` configs | "Spawn sub-agents for long tasks" |
| Tool gotchas | `CLAUDE.md` | "Git push needs auth configured first" |

### Inter-Session Communication

Memoire provides multi-agent orchestration via `memi compose`:

- **Agent orchestrator** — classify intent, plan steps, execute across agents
- **Box widgets** — on-canvas task and status visibility for multi-agent runs
- **Shared project state** — `.memoire/` directory persists across sessions
- **Skill injection** — Notes are loaded at engine init and injected when context matches

---

## Generic Setup (Other Agents)

For Claude Code, Codex, Copilot, or other agents, create `.memoire/learnings/` in your project:

```bash
mkdir -p .memoire/learnings
```

Copy templates or create files with headers.

### Add reference to agent files CLAUDE.md or .github/copilot-instructions.md to remind yourself to log learnings. (this is an alternative to hook-based reminders)

#### Self-Improvement Workflow

When errors or corrections occur:
1. Log to `.memoire/learnings/ERRORS.md`, `LEARNINGS.md`, or `FEATURE_REQUESTS.md`
2. Review and promote broadly applicable learnings to:
   - `CLAUDE.md` - project facts and conventions
   - `.memoire/` configs - agent workflows and automation
   - `.github/copilot-instructions.md` - Copilot context

## Logging Format

### Learning Entry

Append to `.memoire/learnings/LEARNINGS.md`:

```markdown
## [LRN-YYYYMMDD-XXX] category

**Logged**: ISO-8601 timestamp
**Priority**: low | medium | high | critical
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
One-line description of what was learned

### Details
Full context: what happened, what was wrong, what's correct

### Suggested Action
Specific fix or improvement to make

### Metadata
- Source: conversation | error | user_feedback
- Related Files: path/to/file.ext
- Tags: tag1, tag2
- See Also: LRN-20250110-001 (if related to existing entry)
- Pattern-Key: simplify.dead_code | harden.input_validation (optional, for recurring-pattern tracking)
- Recurrence-Count: 1 (optional)
- First-Seen: 2025-01-15 (optional)
- Last-Seen: 2025-01-15 (optional)

---
```

### Error Entry

Append to `.memoire/learnings/ERRORS.md`:

```markdown
## [ERR-YYYYMMDD-XXX] skill_or_command_name

**Logged**: ISO-8601 timestamp
**Priority**: high
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Summary
Brief description of what failed

### Error
```
Actual error message or output
```

### Context
- Command/operation attempted
- Input or parameters used
- Environment details if relevant

### Suggested Fix
If identifiable, what might resolve this

### Metadata
- Reproducible: yes | no | unknown
- Related Files: path/to/file.ext
- See Also: ERR-20250110-001 (if recurring)

---
```

### Feature Request Entry

Append to `.memoire/learnings/FEATURE_REQUESTS.md`:

```markdown
## [FEAT-YYYYMMDD-XXX] capability_name

**Logged**: ISO-8601 timestamp
**Priority**: medium
**Status**: pending
**Area**: frontend | backend | infra | tests | docs | config

### Requested Capability
What the user wanted to do

### User Context
Why they needed it, what problem they're solving

### Complexity Estimate
simple | medium | complex

### Suggested Implementation
How this could be built, what it might extend

### Metadata
- Frequency: first_time | recurring
- Related Features: existing_feature_name

---
```

## ID Generation

Format: `TYPE-YYYYMMDD-XXX`
- TYPE: `LRN` (learning), `ERR` (error), `FEAT` (feature)
- YYYYMMDD: Current date
- XXX: Sequential number or random 3 chars (e.g., `001`, `A7B`)

Examples: `LRN-20250115-001`, `ERR-20250115-A3F`, `FEAT-20250115-002`

## Resolving Entries

When an issue is fixed, update the entry:

1. Change `**Status**: pending` to `**Status**: resolved`
2. Add resolution block after Metadata:

```markdown
### Resolution
- **Resolved**: 2025-01-16T09:00:00Z
- **Commit/PR**: abc123 or #42
- **Notes**: Brief description of what was done
```

Other status values:
- `in_progress` - Actively being worked on
- `wont_fix` - Decided not to address (add reason in Resolution notes)
- `promoted` - Elevated to `CLAUDE.md` or `.memoire/` configs

## Promoting to Project Memory

When a learning is broadly applicable (not a one-off fix), promote it to permanent project memory.

### When to Promote

- Learning applies across multiple files/features
- Knowledge any contributor (human or AI) should know
- Prevents recurring mistakes
- Documents project-specific conventions

### Promotion Targets

| Target | What Belongs There |
|--------|-------------------|
| `CLAUDE.md` | Project facts, conventions, gotchas for all Claude interactions |
| `.memoire/` configs | Agent-specific workflows, tool usage patterns, automation rules |
| `.github/copilot-instructions.md` | Project context and conventions for GitHub Copilot |

### How to Promote

1. **Distill** the learning into a concise rule or fact
2. **Add** to appropriate section in target file (create file if needed)
3. **Update** original entry:
   - Change `**Status**: pending` to `**Status**: promoted`
   - Add `**Promoted**: CLAUDE.md`, `.memoire/`, or `.github/copilot-instructions.md`

### Promotion Examples

**Learning** (verbose):
> Project uses pnpm workspaces. Attempted `npm install` but failed.
> Lock file is `pnpm-lock.yaml`. Must use `pnpm install`.

**In CLAUDE.md** (concise):
```markdown
## Build & Dependencies
- Package manager: pnpm (not npm) - use `pnpm install`
```

**Learning** (verbose):
> When modifying API endpoints, must regenerate TypeScript client.
> Forgetting this causes type mismatches at runtime.

**In CLAUDE.md** (actionable):
```markdown
## After API Changes
1. Regenerate client: `pnpm run generate:api`
2. Check for type errors: `pnpm tsc --noEmit`
```

## Recurring Pattern Detection

If logging something similar to an existing entry:

1. **Search first**: `grep -r "keyword" .memoire/learnings/`
2. **Link entries**: Add `**See Also**: ERR-20250110-001` in Metadata
3. **Bump priority** if issue keeps recurring
4. **Consider systemic fix**: Recurring issues often indicate:
   - Missing documentation (promote to `CLAUDE.md` or `.github/copilot-instructions.md`)
   - Missing automation (add to `.memoire/` configs)
   - Architectural problem (create tech debt ticket)

## Simplify & Harden Feed

Use this workflow to ingest recurring patterns from the `simplify-and-harden`
skill and turn them into durable prompt guidance.

### Ingestion Workflow

1. Read `simplify_and_harden.learning_loop.candidates` from the task summary.
2. For each candidate, use `pattern_key` as the stable dedupe key.
3. Search `.memoire/learnings/LEARNINGS.md` for an existing entry with that key:
   - `grep -n "Pattern-Key: <pattern_key>" .memoire/learnings/LEARNINGS.md`
4. If found:
   - Increment `Recurrence-Count`
   - Update `Last-Seen`
   - Add `See Also` links to related entries/tasks
5. If not found:
   - Create a new `LRN-...` entry
   - Set `Source: simplify-and-harden`
   - Set `Pattern-Key`, `Recurrence-Count: 1`, and `First-Seen`/`Last-Seen`

### Promotion Rule (System Prompt Feedback)

Promote recurring patterns into agent context/system prompt files when all are true:

- `Recurrence-Count >= 3`
- Seen across at least 2 distinct tasks
- Occurred within a 30-day window

Promotion targets:
- `CLAUDE.md`
- `.memoire/` configs
- `.github/copilot-instructions.md`

Write promoted rules as short prevention rules (what to do before/while coding),
not long incident write-ups.

## Periodic Review

Review `.memoire/learnings/` at natural breakpoints:

### When to Review
- Before starting a new major task
- After completing a feature
- When working in an area with past learnings
- Weekly during active development

### Quick Status Check
```bash
# Count pending items
grep -h "Status\*\*: pending" .memoire/learnings/*.md | wc -l

# List pending high-priority items
grep -B5 "Priority\*\*: high" .memoire/learnings/*.md | grep "^## \["

# Find learnings for a specific area
grep -l "Area\*\*: backend" .memoire/learnings/*.md
```

### Review Actions
- Resolve fixed items
- Promote applicable learnings
- Link related entries
- Escalate recurring issues

## Detection Triggers

Automatically log when you notice:

**Corrections** (log as learning with `correction` category):
- "No, that's not right..."
- "Actually, it should be..."
- "You're wrong about..."
- "That's outdated..."

**Feature Requests** (log as feature request):
- "Can you also..."
- "I wish you could..."
- "Is there a way to..."
- "Why can't you..."

**Knowledge Gaps** (log as learning with `knowledge_gap` category):
- User provides information you didn't know
- Documentation you referenced is outdated
- API behavior differs from your understanding

**Errors** (log as error entry):
- Command returns non-zero exit code
- Exception or stack trace
- Unexpected output or behavior
- Timeout or connection failure

## Priority Guidelines

| Priority | When to Use |
|----------|-------------|
| `critical` | Blocks core functionality, data loss risk, security issue |
| `high` | Significant impact, affects common workflows, recurring issue |
| `medium` | Moderate impact, workaround exists |
| `low` | Minor inconvenience, edge case, nice-to-have |

## Area Tags

Use to filter learnings by codebase region:

| Area | Scope |
|------|-------|
| `frontend` | UI, components, client-side code |
| `backend` | API, services, server-side code |
| `infra` | CI/CD, deployment, Docker, cloud |
| `tests` | Test files, testing utilities, coverage |
| `docs` | Documentation, comments, READMEs |
| `config` | Configuration files, environment, settings |

## Best Practices

1. **Log immediately** - context is freshest right after the issue
2. **Be specific** - future agents need to understand quickly
3. **Include reproduction steps** - especially for errors
4. **Link related files** - makes fixes easier
5. **Suggest concrete fixes** - not just "investigate"
6. **Use consistent categories** - enables filtering
7. **Promote aggressively** - if in doubt, add to `CLAUDE.md` or `.github/copilot-instructions.md`
8. **Review regularly** - stale learnings lose value

## Gitignore Options

**Keep learnings local** (per-developer):
```gitignore
.memoire/learnings/
```

**Track learnings in repo** (team-wide):
Don't add to .gitignore - learnings become shared knowledge.

**Hybrid** (track templates, ignore entries):
```gitignore
.memoire/learnings/*.md
!.memoire/learnings/.gitkeep
```

## Hook Integration

Enable automatic reminders through agent hooks. This is **opt-in** — you must explicitly configure hooks.

### Quick Setup (Claude Code / Codex)

Create `.claude/settings.json` in your project and point it at hook scripts you create locally:

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "./.claude/hooks/activator.sh"
      }]
    }]
  }
}
```

This injects a learning evaluation reminder after each prompt (~50-100 tokens overhead).

### Full Setup (With Error Detection)

```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "./.claude/hooks/activator.sh"
      }]
    }],
    "PostToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "command": "./.claude/hooks/error-detector.sh"
      }]
    }]
  }
}
```

### Example Hook Scripts

| Script | Hook Type | Purpose |
|--------|-----------|---------|
| `./.claude/hooks/activator.sh` | UserPromptSubmit | Reminds to evaluate learnings after tasks |
| `./.claude/hooks/error-detector.sh` | PostToolUse (Bash) | Triggers on command errors |

These scripts are not bundled with Mémoire. Create them in your project, then update the paths in your agent hook config.

## Automatic Skill Extraction

When a learning is valuable enough to become a reusable skill, extract it as a Memoire Note.

### Skill Extraction Criteria

A learning qualifies for skill extraction when ANY of these apply:

| Criterion | Description |
|-----------|-------------|
| **Recurring** | Has `See Also` links to 2+ similar issues |
| **Verified** | Status is `resolved` with working fix |
| **Non-obvious** | Required actual debugging/investigation to discover |
| **Broadly applicable** | Not project-specific; useful across codebases |
| **User-flagged** | User says "save this as a skill" or similar |

### Extraction Workflow

1. **Identify candidate**: Learning meets extraction criteria
2. **Scaffold Note**:
   ```bash
   memi notes create skill-name
   ```
3. **Customize skill markdown**: Fill in template with learning content
4. **Update learning**: Set status to `promoted_to_skill`, add `Skill-Path`
5. **Verify**: Read skill in fresh session to ensure it's self-contained

### Manual Extraction

If you prefer manual creation:

1. Create `notes/<skill-name>/note.json` with manifest
2. Create `notes/<skill-name>/<skill-name>.md` with skill content
3. Follow Memoire Note conventions:
   - YAML frontmatter with `name` and `description`
   - `note.json` manifest with category, tags, activateOn
   - Skill file contains the full operational instructions

### Extraction Detection Triggers

Watch for these signals that a learning should become a skill:

**In conversation:**
- "Save this as a skill"
- "I keep running into this"
- "This would be useful for other projects"
- "Remember this pattern"

**In learning entries:**
- Multiple `See Also` links (recurring issue)
- High priority + resolved status
- Category: `best_practice` with broad applicability
- User feedback praising the solution

### Skill Quality Gates

Before extraction, verify:

- [ ] Solution is tested and working
- [ ] Description is clear without original context
- [ ] Code examples are self-contained
- [ ] No project-specific hardcoded values
- [ ] Follows Note naming conventions (lowercase, hyphens)

## Multi-Agent Support

This skill works across Memoire's agent orchestrator and different AI coding agents with agent-specific activation.

### Memoire Agent Orchestrator

**Activation**: Automatic via Note injection — `activateOn: "always"` ensures this skill loads for every agent session
**Setup**: Install as a Memoire Note, engine auto-discovers and injects
**Detection**: Automatic via Memoire's intent classification and agent orchestration
**Multi-agent**: When `memi compose` spawns multiple agents, each gets the self-improvement skill injected. Learnings from all agents are written to the shared `.memoire/learnings/` directory, enabling cross-agent knowledge sharing.

### Claude Code

**Activation**: Hooks (UserPromptSubmit, PostToolUse)
**Setup**: `.claude/settings.json` with hook configuration
**Detection**: Automatic via hook scripts

### Codex CLI

**Activation**: Hooks (same pattern as Claude Code)
**Setup**: `.codex/settings.json` with hook configuration
**Detection**: Automatic via hook scripts

### GitHub Copilot

**Activation**: Manual (no hook support)
**Setup**: Add to `.github/copilot-instructions.md`:

```markdown
## Self-Improvement

After solving non-obvious issues, consider logging to `.memoire/learnings/`:
1. Use format from self-improvement skill
2. Link related entries with See Also
3. Promote high-value learnings to skills

Ask in chat: "Should I log this as a learning?"
```

**Detection**: Manual review at session end

### Agent-Agnostic Guidance

Regardless of agent, apply self-improvement when you:

1. **Discover something non-obvious** - solution wasn't immediate
2. **Correct yourself** - initial approach was wrong
3. **Learn project conventions** - discovered undocumented patterns
4. **Hit unexpected errors** - especially if diagnosis was difficult
5. **Find better approaches** - improved on your original solution

### Copilot Chat Integration

For Copilot users, add this to your prompts when relevant:

> After completing this task, evaluate if any learnings should be logged to `.memoire/learnings/` using the self-improvement skill format.

Or use quick prompts:
- "Log this to learnings"
- "Create a Note from this solution"
- "Check .memoire/learnings/ for related issues"
