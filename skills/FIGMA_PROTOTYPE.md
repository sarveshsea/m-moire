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

> Build interactive prototypes in Figma with flows, transitions, and user journey mapping. Generates prototype HTML for testing. Requires /figma-use.

## Freedom Level: High

Full creative freedom for interactions and flows. Must use existing components and follow atomic structure.

## When to Use
- Creating clickable prototypes for user testing
- Demonstrating user flows (onboarding, checkout, auth)
- Building interactive presentations for stakeholders
- Generating standalone HTML prototypes via `memi prototype`

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

### Step 6: Generate Prototype HTML
```
memi prototype → generates prototype/prototype.html
```
This creates a standalone HTML file with all screens and click-through navigation, viewable in any browser.

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

## Spec Integration
Each screen in the prototype should have a PageSpec:
```
memi spec page Welcome
memi spec page FeatureHighlight
memi spec page Dashboard
```

The prototype flow itself is captured in an IA spec:
```
memi ia create OnboardingFlow
```

## Anti-Patterns
- Dead-end screens with no navigation
- Inconsistent transition types within the same flow
- Missing back/cancel actions
- Screens not built from reusable components
- Floating screens outside the flow Section
- Not generating the HTML prototype for stakeholder review
