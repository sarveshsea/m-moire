# /multi-agent — Parallel Agent Workflows in Figma

> Orchestrate multiple Claude instances on the Figma canvas with full transparency via box widgets, coordinated handoffs, and error recovery. Requires /figma-use.

## Freedom Level: High

Each agent operates autonomously within its scope. The orchestrator coordinates handoffs and resolves conflicts.

## Architecture

### Port Allocation
```
Port 9223 → Primary agent (orchestrator)
Port 9224 → Token engineer
Port 9225 → Component architect
Port 9226 → Layout designer
Port 9227 → Code generator
Port 9228-9232 → Additional specialists
```
The Mémoire plugin auto-discovers all instances via port scanning (9223-9232) every 5 seconds.

### Instance Identification
Each agent MUST identify itself on connect:
```
memi connect --role token-engineer --name "Token Agent"
memi connect --role component-architect --name "Component Agent"
memi connect --role layout-designer --name "Layout Agent"
```

## Box Widget Protocol

Every agent creates a status box on the Figma canvas for human visibility.

### Creating a Box
```javascript
let agentSection = figma.currentPage.findOne(
  n => n.type === 'SECTION' && n.name === 'Active Agents'
);
if (!agentSection) {
  agentSection = figma.createSection();
  agentSection.name = 'Active Agents';
  agentSection.x = -400;
  agentSection.y = 0;
}

const box = figma.createFrame();
box.name = `[${role}] ${task}`;
box.layoutMode = 'VERTICAL';
box.primaryAxisSizingMode = 'AUTO';
box.counterAxisSizingMode = 'FIXED';
box.resize(300, 1);
box.paddingLeft = box.paddingRight = 12;
box.paddingTop = box.paddingBottom = 10;
box.itemSpacing = 4;
box.cornerRadius = 8;
box.fills = [{ type: 'SOLID', color: { r: 0.06, g: 0.06, b: 0.12 }, opacity: 0.95 }];
box.strokes = [{ type: 'SOLID', color: statusBorderColor }];
box.strokeWeight = 1.5;
agentSection.appendChild(box);
```

### Status Colors
```javascript
const statusColors = {
  idle:  { r: 0.3, g: 0.3, b: 0.4 },   // Gray-blue
  busy:  { r: 0.96, g: 0.62, b: 0.04 }, // Amber
  error: { r: 0.94, g: 0.27, b: 0.27 }, // Red
  done:  { r: 0.06, g: 0.73, b: 0.51 }, // Green
};
```

### Updating & Collapsing
```javascript
// Update status
myBox.name = `[${role}] ${newTask}`;
myBox.strokes = [{ type: 'SOLID', color: statusColors[status] }];

// Collapse on completion
myBox.resize(300, 28);
myBox.name = `✓ [${role}] Complete`;
myBox.fills = [{ type: 'SOLID', color: { r: 0.04, g: 0.45, b: 0.34 }, opacity: 0.3 }];
```

## Coordination Patterns

### Pattern 1: Pipeline (Sequential Handoff)
```
Token Engineer → Component Architect → Layout Designer → Code Generator
     ↓                   ↓                    ↓                ↓
  Variables         Components            Pages           React code
```
Each agent waits for the previous to broadcast completion.

### Pattern 2: Parallel Atoms (Fan-Out)
```
Orchestrator
├── Agent A: builds Button, Badge, Avatar, Icon
├── Agent B: builds Input, Label, Select, Checkbox
├── Agent C: builds Card, Separator, Tooltip, Dialog
└── Merge: all atoms ready → continue to molecules
```

### Pattern 3: Page Parallel (Independent)
```
Orchestrator
├── Agent A: designs Dashboard page
├── Agent B: designs Auth pages (Login, Signup, Forgot)
├── Agent C: designs Settings pages
└── Each agent runs full atomic pipeline for its scope
```

### Pattern 4: Research + Design (Concurrent)
```
Research Agent: analyzing data, producing insights
Design Agent: building components as research completes
Code Agent: generating code as designs stabilize
All three work simultaneously, communicating via agent-broadcast
```

## Error Recovery Protocol

When an agent encounters an error:
```
1. Update box widget: status → "error", show error message
2. Broadcast: agent-status { role, task, status: "error", error: "..." }
3. Attempt self-fix (max 2 retries)
4. If unrecoverable:
   a. Broadcast failure to orchestrator
   b. Orchestrator reassigns task or adjusts plan
   c. Box widget stays red until resolved
5. Never silently fail — always visible in Figma
```

## Message Protocol
```typescript
// Agent announcing status
{ type: 'agent-status', role: string, task: string, status: 'idle'|'busy'|'error'|'done' }

// Agent sending results to others
{ type: 'agent-broadcast', text: string, data: any, target?: string }

// Requesting agent list
{ type: 'agent-list' }
// Response: { agents: [{ id, role, task, status, capabilities }] }
```

## Anti-Patterns
- Two agents modifying the same component simultaneously (use locking)
- Agents not announcing their role on connect
- Skipping box widgets (humans lose visibility)
- Not collapsing boxes on completion (visual clutter)
- Agents working without checking what others have built
- Silently failing without updating box widget status
