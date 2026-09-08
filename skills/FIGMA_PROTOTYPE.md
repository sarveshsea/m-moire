---
name: figma-prototype
description: Build interactive Figma prototypes with flows, transitions, and user journey mapping
user-invocable: true
model: opus
effort: max
context:
  - skills/FIGMA_USE.md
---

# /figma-prototype — Create Interactive Prototypes

## 2.8 beta scope

This is optional reference guidance, not an automatic Memi workflow. Figma tool names and canvas examples require an installed external provider and the host's authorization; locked Memi MCP does not expose them. Deferred CLI commands remain unavailable even with capability grants. For supported local context, use `memi --profile locked agent brief . --json`; for static frontend inspection, use `memi --profile locked diagnose . --no-write --json --fail-on none`. Neither command certifies the external workflow below.

> Build interactive prototypes in Figma with flows, transitions, and user journey mapping. Generates prototype HTML for testing. Requires /figma-use.

## Freedom Level: High

Full creative freedom for interactions and flows. Must use existing components and follow atomic structure.

## When to Use
- Creating clickable prototypes for user testing
- Demonstrating user flows (onboarding, checkout, auth)
- Building interactive presentations for stakeholders
- Planning a prototype for an authorized external provider or repository workflow

## Workflow

### Step 1: Define the User Journey
```
Map the flow as screens + transitions:

Onboarding Flow:
  Welcome → Feature 1 → Feature 2 → Feature 3 → Dashboard

Auth Flow:
  Login → [success] → Dashboard
  Login → [forgot] → ForgotPassword → ResetEmail → Login
  Login → [signup] → Signup → VerifyEmail → Dashboard

Checkout Flow:
  Cart → Shipping → Payment → Review → Confirmation
```

### Step 2: Create Screens
For each screen in the flow:
```
1. Check if the page spec exists → read specs/pages/
2. If exists → use_figma to create from spec
3. If new → plan atomic decomposition, build bottom-up
4. Create all screens on the same Figma page
5. Arrange in a flow layout (horizontal, spaced)
```

### Step 3: Add Interactions
```javascript
// Navigate on click
button.reactions = [{
  action: { type: 'NODE', destinationId: nextScreenId, navigation: 'NAVIGATE' },
  trigger: { type: 'ON_CLICK' }
}];

// Smart animate between states
button.reactions = [{
  action: {
    type: 'NODE',
    destinationId: nextScreenId,
    navigation: 'NAVIGATE',
    transition: {
      type: 'SMART_ANIMATE',
      easing: { type: 'EASE_IN_OUT' },
      duration: 0.3
    }
  },
  trigger: { type: 'ON_CLICK' }
}];

// Overlay (modal, dropdown)
trigger.reactions = [{
  action: {
    type: 'NODE',
    destinationId: overlayId,
    navigation: 'OVERLAY',
    overlayRelativePosition: { x: 0, y: 0 }
  },
  trigger: { type: 'ON_CLICK' }
}];
```

### Step 4: Transition Types
| Transition | Use Case | Duration |
|-----------|----------|----------|
| `DISSOLVE` | Page navigation | 0.2s |
| `SMART_ANIMATE` | State changes, morphing | 0.3s |
| `MOVE_IN` | Sheets, side panels | 0.25s |
| `SLIDE_IN` | Page push transitions | 0.3s |
| `PUSH` | Stack navigation (mobile) | 0.3s |

### Step 5: Self-Healing Validation
Run the self-healing loop from `/figma-use` for each screen. Additionally: verify all interactions connect, no dead-end screens, consistent transition types within each flow.

### Step 6: Share the Prototype

Use the external provider's supported prototype sharing workflow, or the repository's authorized HTML implementation workflow. Memi's `prototype` command is unavailable in this beta; no standalone HTML export is promised.

## Flow Layout in Figma
```
Arrange screens in a clear flow:

Section "User Flow: Onboarding"
├── [Welcome]  ──→  [Feature 1]  ──→  [Feature 2]  ──→  [Dashboard]
│                                                    ↗
├── [Login]  ──→  [Dashboard]
│     ↓
├── [ForgotPwd]  ──→  [ResetEmail]  ──→  [Login]
│     ↓
└── [Signup]  ──→  [VerifyEmail]  ──→  [Dashboard]

Spacing: 200px between screens (horizontal)
Connection lines: use FigJam connectors or annotation arrows
```

## Handoff

Document each screen, state, route, and transition in the repository's approved format. Memi's `spec page` and `ia create` commands are unavailable in this beta.

## Anti-Patterns
- Dead-end screens with no navigation
- Inconsistent transition types within the same flow
- Missing back/cancel actions
- Screens not built from reusable components
- Floating screens outside the flow Section
- Sharing a prototype without identifying which interactions were verified
