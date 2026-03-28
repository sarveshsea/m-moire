---
name: Animation Craft
description: Motion design and micro-interaction craft for production UI
category: craft
activateOn: component-creation
freedomLevel: high
version: 1.0.0
tags:
  - animation
  - motion
  - framer-motion
  - micro-interactions
  - transitions
  - choreography
---

# Animation Craft

Production-grade motion design for UI components. This skill covers animation
principles adapted for interfaces, timing systems, Framer Motion patterns,
CSS transitions, loading choreography, scroll-triggered motion, accessibility,
and performance optimization.

---

## 1. The 12 Principles of Animation — Adapted for UI

Disney's 12 principles translate directly into interface motion when reframed
for digital interaction rather than character animation.

### 1.1 Squash and Stretch
In UI: scale transforms on press states. A button compresses slightly on tap
(`scale: 0.97`) and rebounds on release (`scale: 1.0`). Preserves the feeling
of physicality without literal deformation.

### 1.2 Anticipation
In UI: a brief preparatory motion before the main action. A card about to fly
off-screen nudges 4px in the opposite direction first. A delete action shakes
the target element before removal. Primes the user for what comes next.

### 1.3 Staging
In UI: direct attention to the primary action. Dim or blur surrounding elements
when a modal opens. Use motion to guide the eye — the element that moves is the
element that matters. Never animate two competing things simultaneously.

### 1.4 Straight Ahead vs. Pose to Pose
In UI: pose-to-pose dominates. Define keyframes (initial state, final state)
and let easing handle interpolation. Straight-ahead is rare — reserved for
particle effects or generative motion where each frame builds on the last.

### 1.5 Follow Through and Overlapping Action
In UI: staggered children. When a panel slides in, its contents arrive 50-80ms
later. A card's shadow settles after the card itself. Elements within a group
resolve at slightly different times, creating organic layered motion.

### 1.6 Slow In, Slow Out (Ease In, Ease Out)
In UI: the foundation of all easing. Nothing moves linearly except progress
bars. Entrances use ease-out (fast start, gentle landing). Exits use ease-in
(gentle start, fast departure). State changes use ease-in-out.

### 1.7 Arcs
In UI: curved motion paths for elements traversing significant distance. A FAB
expanding into a full sheet follows an arc, not a straight diagonal. Implemented
via simultaneous x/y transforms with different easing curves.

### 1.8 Secondary Action
In UI: supporting animations that reinforce the primary. A success checkmark
draws itself (primary) while the surrounding circle fills green (secondary).
A notification badge bounces in while a subtle ring pulse radiates outward.

### 1.9 Timing
In UI: duration is meaning. Fast (100-150ms) = direct manipulation, the user
caused this. Medium (200-350ms) = state transition, something changed. Slow
(400-600ms) = page-level, a significant context shift occurred.

### 1.10 Exaggeration
In UI: used sparingly and intentionally. Error states shake with slightly more
amplitude than physics would suggest. Success animations overshoot their final
scale by 5-10% before settling. Subtle exaggeration creates delight; heavy
exaggeration creates cartoon interfaces.

### 1.11 Solid Drawing
In UI: consistent transform origins and spatial relationships. Elements scale
from their visual center. Panels slide from the edge they are anchored to.
Maintain the illusion of physical consistency — objects have weight, position,
and spatial logic.

### 1.12 Appeal
In UI: motion should feel inevitable, not decorative. Every animation answers
"what changed and why." If removing an animation makes the interface harder to
understand, it belongs. If removing it changes nothing, delete it.

---

## 2. Timing and Easing Reference

### 2.1 Cubic-Bezier Values

```
Snappy       cubic-bezier(0.2, 0, 0, 1)
  Fast attack, smooth settle. Best for: toggles, switches, small state changes.
  Feels responsive and decisive.

Smooth       cubic-bezier(0.4, 0, 0.2, 1)
  Material Design standard. Best for: general transitions, panels, modals.
  Feels polished and professional.

Bouncy       cubic-bezier(0.34, 1.56, 0.64, 1)
  Overshoots target, settles back. Best for: success states, playful UI,
  notification badges. Use at durations under 400ms to avoid feeling sluggish.

Gentle       cubic-bezier(0.4, 0, 0.6, 1)
  Symmetric ease-in-out. Best for: looping animations, hover states,
  ambient motion. Feels calm and unhurried.

Sharp Enter  cubic-bezier(0, 0, 0.2, 1)
  Pure ease-out. Best for: elements entering the viewport. Fast arrival,
  gentle deceleration into final position.

Sharp Exit   cubic-bezier(0.4, 0, 1, 1)
  Pure ease-in. Best for: elements leaving the viewport. Gentle start,
  accelerates away. User does not need to watch it leave.

Spring       cubic-bezier(0.175, 0.885, 0.32, 1.275)
  Slight overshoot with natural settle. Best for: popovers, tooltips,
  dropdown menus. Feels alive without being distracting.
```

### 2.2 Framer Motion Spring Presets

```typescript
// Snappy spring — direct manipulation, toggles
const snappySpring = { type: "spring", stiffness: 500, damping: 30 };

// Smooth spring — general transitions
const smoothSpring = { type: "spring", stiffness: 300, damping: 25 };

// Bouncy spring — playful feedback
const bouncySpring = { type: "spring", stiffness: 400, damping: 15 };

// Gentle spring — ambient, decorative
const gentleSpring = { type: "spring", stiffness: 120, damping: 20 };

// Heavy spring — large panels, sheets
const heavySpring = { type: "spring", stiffness: 200, damping: 30, mass: 1.5 };
```

---

## 3. Duration Guidelines by Interaction Type

### 3.1 Micro Interactions (100-200ms)
Direct responses to user input. The user caused this and expects instant feedback.

| Pattern | Duration | Easing |
|---------|----------|--------|
| Button press scale | 100ms | Snappy |
| Toggle switch | 150ms | Snappy |
| Checkbox/radio | 120ms | Snappy |
| Ripple effect | 200ms | Sharp Enter |
| Tooltip appear | 150ms | Sharp Enter |
| Focus ring | 100ms | Snappy |
| Color change (hover) | 150ms | Gentle |
| Icon swap | 120ms | Snappy |

### 3.2 State Transitions (200-400ms)
The interface is changing state. Something happened — a panel opened, content
loaded, a filter applied.

| Pattern | Duration | Easing |
|---------|----------|--------|
| Dropdown open | 200ms | Sharp Enter |
| Dropdown close | 150ms | Sharp Exit |
| Accordion expand | 300ms | Smooth |
| Modal enter | 300ms | Spring |
| Modal exit | 200ms | Sharp Exit |
| Tab content swap | 250ms | Smooth |
| Sidebar toggle | 300ms | Smooth |
| Toast notification | 350ms | Spring |
| Card expand | 350ms | Smooth |
| Filter results | 250ms | Smooth |

### 3.3 Page Transitions (300-600ms)
Significant context shift. A new view, a navigation event, a major layout change.

| Pattern | Duration | Easing |
|---------|----------|--------|
| Page crossfade | 300ms | Gentle |
| Slide navigation | 400ms | Smooth |
| Shared layout morph | 500ms | Smooth |
| Full-screen expand | 500ms | Smooth |
| Route change fade | 300ms | Gentle |
| Stagger children (page) | 400ms total | Smooth + stagger 50ms |

### 3.4 The Exit Rule
Exits should be 30-50% faster than entrances. Users do not need to watch
something leave — they have already moved on mentally. A modal that enters in
300ms should exit in 180-200ms.

---

## 4. Framer Motion Patterns

### 4.1 Basic: animate / initial / exit

```tsx
import { motion } from "framer-motion";

// Fade in on mount
function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

// Slide up on mount, slide down on unmount
function SlideUp({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{
        duration: 0.35,
        ease: [0.2, 0, 0, 1],
        exit: { duration: 0.2, ease: [0.4, 0, 1, 1] },
      }}
    >
      {children}
    </motion.div>
  );
}
```

### 4.2 Variants and Orchestration

Variants define named animation states. Orchestration controls how children
animate relative to parents.

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
      when: "beforeChildren",
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.03,
      staggerDirection: -1,
      when: "afterChildren",
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.2, 0, 0, 1] },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  },
};

function StaggerList({ items }: { items: Item[] }) {
  return (
    <motion.ul
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {items.map((item) => (
        <motion.li key={item.id} variants={itemVariants}>
          {item.content}
        </motion.li>
      ))}
    </motion.ul>
  );
}
```

### 4.3 AnimatePresence for Mount/Unmount

AnimatePresence enables exit animations. Without it, removed elements
disappear instantly.

```tsx
import { AnimatePresence, motion } from "framer-motion";

function NotificationStack({ notifications }: { notifications: Notification[] }) {
  return (
    <AnimatePresence mode="popLayout">
      {notifications.map((notif) => (
        <motion.div
          key={notif.id}
          layout
          initial={{ opacity: 0, x: 80, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 80, scale: 0.95 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
          }}
        >
          <NotificationCard notification={notif} />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
```

**AnimatePresence modes:**
- `"sync"` (default) — children animate in/out simultaneously
- `"wait"` — outgoing completes before incoming starts
- `"popLayout"` — exiting elements are popped from layout flow immediately,
  remaining elements reflow while exit animation plays

### 4.4 Layout Animations

The `layout` prop auto-animates any layout change — position, size, or
order caused by DOM reflow. This is extremely powerful and often the only
animation you need.

```tsx
function ExpandableCard({ isOpen, title, content }: ExpandableCardProps) {
  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="overflow-hidden rounded-lg border"
    >
      <motion.h3 layout="position">{title}</motion.h3>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
```

**Layout prop values:**
- `layout={true}` — animate position and size
- `layout="position"` — only animate position, not size
- `layout="size"` — only animate size, not position
- `layoutId="shared-id"` — shared layout animation across components

### 4.5 Gesture Animations

```tsx
function InteractiveCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      whileHover={{
        scale: 1.02,
        boxShadow: "0 8px 30px rgba(0, 0, 0, 0.12)",
        transition: { duration: 0.2, ease: [0.2, 0, 0, 1] },
      }}
      whileTap={{
        scale: 0.98,
        transition: { duration: 0.1 },
      }}
      className="cursor-pointer rounded-lg border p-4"
    >
      {children}
    </motion.div>
  );
}

// Draggable element with constraints
function DraggableItem() {
  const constraintsRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={constraintsRef} className="relative h-64 w-full">
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        dragTransition={{
          bounceStiffness: 300,
          bounceDamping: 20,
        }}
        whileDrag={{ scale: 1.05, cursor: "grabbing" }}
        className="h-16 w-16 cursor-grab rounded-lg bg-primary"
      />
    </div>
  );
}
```

### 4.6 useSpring and useMotionValue

For imperative, physics-based animations that respond to changing values
rather than declarative state.

```tsx
import { useMotionValue, useSpring, useTransform, motion } from "framer-motion";

function ProgressRing({ progress }: { progress: number }) {
  const motionProgress = useMotionValue(0);
  const springProgress = useSpring(motionProgress, {
    stiffness: 100,
    damping: 20,
  });

  // Derived values
  const strokeDashoffset = useTransform(
    springProgress,
    [0, 100],
    [283, 0] // circumference of r=45 circle
  );
  const color = useTransform(
    springProgress,
    [0, 50, 100],
    ["#ef4444", "#eab308", "#22c55e"]
  );

  // Update when prop changes
  useEffect(() => {
    motionProgress.set(progress);
  }, [progress, motionProgress]);

  return (
    <svg width="100" height="100" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" strokeWidth="6" />
      <motion.circle
        cx="50"
        cy="50"
        r="45"
        fill="none"
        strokeWidth="6"
        strokeLinecap="round"
        style={{
          strokeDasharray: 283,
          strokeDashoffset,
          stroke: color,
          rotate: -90,
          transformOrigin: "50% 50%",
        }}
      />
    </svg>
  );
}
```

### 4.7 staggerChildren Patterns

Stagger creates cascading reveals. The key is finding the right delay:
too short feels simultaneous, too long feels sluggish.

```
Items    Stagger Delay    Total Stagger Time    Feel
3-5      60-80ms          180-400ms             Natural
6-10     40-60ms          240-600ms             Flowing
11-20    25-40ms          275-800ms             Cascading
20+      15-25ms          Cap at 600ms          Wave
```

**Rule: cap total stagger time at 600ms.** Beyond that, the last items feel
delayed rather than choreographed. For 30 items at 20ms stagger = 600ms total,
which is the upper limit.

```tsx
// Dynamic stagger calculation
function getStaggerDelay(itemCount: number): number {
  const maxTotalStagger = 0.6; // 600ms
  const minDelay = 0.015;
  const maxDelay = 0.08;
  const calculated = maxTotalStagger / itemCount;
  return Math.max(minDelay, Math.min(maxDelay, calculated));
}
```

---

## 5. CSS Transition Patterns

Use CSS transitions when:
- The animation is simple (opacity, transform, color)
- The element never unmounts (hover, focus, active states)
- Bundle size matters and Framer Motion is not already in the project
- The animation is purely decorative

### 5.1 Transition Utility Classes

```css
/* Base transitions — apply to elements that need animation */
.transition-micro {
  transition-property: transform, opacity, box-shadow;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.2, 0, 0, 1);
}

.transition-state {
  transition-property: transform, opacity, background-color, border-color, box-shadow;
  transition-duration: 250ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

.transition-page {
  transition-property: opacity, transform;
  transition-duration: 350ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.6, 1);
}

/* Color-only transition (no layout properties) */
.transition-colors-fast {
  transition-property: color, background-color, border-color, fill, stroke;
  transition-duration: 150ms;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 5.2 CSS Keyframe Patterns

```css
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-4px); }
  40% { transform: translateX(4px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(2px); }
}
```

### 5.3 When to Use CSS vs. Framer Motion

| Scenario | Use CSS | Use Framer Motion |
|----------|---------|-------------------|
| Hover/focus/active states | Yes | No |
| Element never unmounts | Yes | Optional |
| Mount animation only | Yes (animation-fill-mode: both) | Optional |
| Unmount animation needed | No | Yes (AnimatePresence) |
| Layout animation | No | Yes (layout prop) |
| Gesture-driven | No | Yes (whileHover, drag) |
| Physics-based spring | No | Yes (useSpring) |
| Shared layout transition | No | Yes (layoutId) |
| Stagger orchestration | Possible but brittle | Yes (staggerChildren) |
| Scroll-linked values | Possible (scroll-timeline) | Yes (useScroll) |

---

## 6. Loading State Choreography

Loading is not a waiting room. It is a sequence of progressive reveals that
communicate progress and maintain spatial stability.

### 6.1 Skeleton to Content Transition

```tsx
const skeletonVariants = {
  loading: {
    opacity: 1,
  },
  loaded: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
};

const contentVariants = {
  loading: {
    opacity: 0,
    y: 8,
  },
  loaded: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.2, 0, 0, 1],
      delay: 0.1, // overlap with skeleton fade
    },
  },
};

function DataCard({ data, isLoading }: DataCardProps) {
  const state = isLoading ? "loading" : "loaded";

  return (
    <div className="relative">
      <motion.div
        variants={skeletonVariants}
        animate={state}
        className="absolute inset-0"
        style={{ pointerEvents: isLoading ? "auto" : "none" }}
      >
        <SkeletonCard />
      </motion.div>

      <motion.div variants={contentVariants} animate={state}>
        {data && <CardContent data={data} />}
      </motion.div>
    </div>
  );
}
```

### 6.2 Progressive Reveal Pattern

When a page has multiple data sources loading at different speeds, reveal
each section as it arrives rather than waiting for all data.

```tsx
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.2, 0, 0, 1] },
  },
};

function Dashboard({ metrics, chart, activity }: DashboardProps) {
  return (
    <div className="space-y-6">
      <AnimatePresence>
        {metrics && (
          <motion.section
            key="metrics"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
          >
            <MetricsRow data={metrics} />
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chart && (
          <motion.section
            key="chart"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
          >
            <ActivityChart data={chart} />
          </motion.section>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activity && (
          <motion.section
            key="activity"
            variants={sectionVariants}
            initial="hidden"
            animate="visible"
          >
            <ActivityFeed data={activity} />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
```

### 6.3 Shimmer Skeleton

```tsx
function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-shimmer rounded bg-gradient-to-r from-muted via-muted/50 via-muted",
        "bg-[length:400%_100%]",
        className
      )}
    />
  );
}
```

Tailwind config addition:

```js
animation: {
  shimmer: "shimmer 2s ease-in-out infinite",
},
keyframes: {
  shimmer: {
    "0%": { backgroundPosition: "200% 0" },
    "100%": { backgroundPosition: "-200% 0" },
  },
},
```

---

## 7. Page Transition Patterns

### 7.1 Shared Layout Transition

When navigating between a list view and a detail view, morph the clicked
item into the detail page for spatial continuity.

```tsx
// List view
function ProjectList({ projects }: { projects: Project[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {projects.map((project) => (
        <motion.div key={project.id} layoutId={`project-${project.id}`}>
          <Link href={`/projects/${project.id}`}>
            <motion.h3 layoutId={`title-${project.id}`}>
              {project.name}
            </motion.h3>
            <motion.img layoutId={`image-${project.id}`} src={project.cover} />
          </Link>
        </motion.div>
      ))}
    </div>
  );
}

// Detail view
function ProjectDetail({ project }: { project: Project }) {
  return (
    <motion.div layoutId={`project-${project.id}`} className="max-w-4xl mx-auto">
      <motion.h1 layoutId={`title-${project.id}`} className="text-4xl">
        {project.name}
      </motion.h1>
      <motion.img
        layoutId={`image-${project.id}`}
        src={project.cover}
        className="w-full rounded-xl"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { delay: 0.3 } }}
      >
        <p>{project.description}</p>
      </motion.div>
    </motion.div>
  );
}
```

### 7.2 Crossfade Page Transition

```tsx
const pageVariants = {
  initial: { opacity: 0 },
  enter: {
    opacity: 1,
    transition: { duration: 0.3, ease: [0.4, 0, 0.6, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] },
  },
};

function PageWrapper({ children, key }: { children: React.ReactNode; key: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.main
        key={key}
        variants={pageVariants}
        initial="initial"
        animate="enter"
        exit="exit"
      >
        {children}
      </motion.main>
    </AnimatePresence>
  );
}
```

### 7.3 Directional Slide Transition

```tsx
function SlideTransition({
  children,
  direction,
  routeKey,
}: {
  children: React.ReactNode;
  direction: "left" | "right";
  routeKey: string;
}) {
  const xOffset = direction === "left" ? -60 : 60;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={routeKey}
        initial={{ x: xOffset, opacity: 0 }}
        animate={{ x: 0, opacity: 1, transition: { duration: 0.35, ease: [0.2, 0, 0, 1] } }}
        exit={{ x: -xOffset, opacity: 0, transition: { duration: 0.2, ease: [0.4, 0, 1, 1] } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

---

## 8. List Animation Patterns

### 8.1 Animated List with Add/Remove

```tsx
function AnimatedList({ items }: { items: Item[] }) {
  return (
    <motion.ul layout className="space-y-2">
      <AnimatePresence>
        {items.map((item) => (
          <motion.li
            key={item.id}
            layout
            initial={{ opacity: 0, height: 0, marginBottom: 0 }}
            animate={{
              opacity: 1,
              height: "auto",
              marginBottom: 8,
              transition: {
                height: { type: "spring", stiffness: 500, damping: 30 },
                opacity: { duration: 0.2, delay: 0.05 },
              },
            }}
            exit={{
              opacity: 0,
              height: 0,
              marginBottom: 0,
              transition: {
                height: { duration: 0.2 },
                opacity: { duration: 0.15 },
              },
            }}
          >
            <ListItem item={item} />
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ul>
  );
}
```

### 8.2 Reorder with Drag

```tsx
import { Reorder, AnimatePresence } from "framer-motion";

function ReorderableList({ items, onReorder }: ReorderableListProps) {
  return (
    <Reorder.Group
      axis="y"
      values={items}
      onReorder={onReorder}
      className="space-y-2"
    >
      <AnimatePresence>
        {items.map((item) => (
          <Reorder.Item
            key={item.id}
            value={item}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            whileDrag={{
              scale: 1.03,
              boxShadow: "0 8px 20px rgba(0, 0, 0, 0.15)",
              cursor: "grabbing",
            }}
            className="cursor-grab rounded-lg border bg-background p-3"
          >
            {item.content}
          </Reorder.Item>
        ))}
      </AnimatePresence>
    </Reorder.Group>
  );
}
```

---

## 9. Scroll-Triggered Animations

### 9.1 useInView — Reveal on Scroll

```tsx
import { useInView, motion } from "framer-motion";
import { useRef } from "react";

function ScrollReveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, {
    once: true,       // only animate once
    margin: "-80px",  // trigger 80px before element enters viewport
  });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
```

### 9.2 Scroll-Linked Progress

```tsx
import { useScroll, useTransform, motion } from "framer-motion";

function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 origin-left bg-primary z-50"
      style={{ scaleX }}
    />
  );
}
```

### 9.3 Parallax on Scroll

```tsx
function ParallaxSection({ children, speed = 0.5 }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, speed * -100]);

  return (
    <div ref={ref} className="relative overflow-hidden">
      <motion.div style={{ y }}>{children}</motion.div>
    </div>
  );
}
```

---

## 10. Reduced Motion: Respecting prefers-reduced-motion

This is not optional. Motion sensitivity is a real accessibility need.

### 10.1 CSS Approach

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 10.2 Framer Motion Approach

```tsx
import { useReducedMotion } from "framer-motion";

function AnimatedComponent({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { duration: 0.35, ease: [0.2, 0, 0, 1] }
      }
    >
      {children}
    </motion.div>
  );
}
```

### 10.3 Global Reduced Motion Provider

```tsx
import { MotionConfig, useReducedMotion } from "framer-motion";

function MotionProvider({ children }: { children: React.ReactNode }) {
  const shouldReduce = useReducedMotion();

  return (
    <MotionConfig reducedMotion="user">
      {children}
    </MotionConfig>
  );
}
```

**reducedMotion options:**
- `"user"` — respect OS setting, replace animations with instant transforms
- `"never"` — always animate (use only for critical functional animations)
- `"always"` — always reduce (testing)

### 10.4 What to Preserve Under Reduced Motion
- Opacity changes (crossfade is generally safe)
- Color transitions
- Functional animations (progress indicators, loading spinners)

### 10.5 What to Remove Under Reduced Motion
- Spatial transforms (slide, scale, rotate)
- Parallax effects
- Bouncing/spring overshoot
- Stagger delays
- Continuous ambient animation

---

## 11. Performance Optimization

### 11.1 GPU-Accelerated Properties

Only four CSS properties are hardware-accelerated (composited without layout
or paint recalculation):

```
transform     (translate, scale, rotate)
opacity
filter        (blur, brightness — on supported browsers)
will-change   (hint to browser, use sparingly)
```

**Never animate these properties** — they trigger layout or paint:
- `width`, `height` (use `scale` instead)
- `top`, `left`, `right`, `bottom` (use `translate` instead)
- `margin`, `padding` (use `translate` instead)
- `border-radius` on large elements (pre-compute with `clip-path`)
- `box-shadow` (animate `opacity` of a shadow pseudo-element instead)

### 11.2 Avoiding Layout Thrash

```tsx
// BAD: animating height causes layout recalculation every frame
<motion.div animate={{ height: isOpen ? 300 : 0 }} />

// GOOD: animate scaleY from a fixed-height container
<motion.div
  animate={{ scaleY: isOpen ? 1 : 0 }}
  style={{ transformOrigin: "top", height: 300 }}
/>

// BEST: use Framer Motion layout animation which handles this automatically
<motion.div layout animate={{ height: isOpen ? "auto" : 0 }} />
```

### 11.3 Reducing Composite Layers

Each animated element becomes its own composite layer. Too many layers (50+
simultaneously) degrades performance.

```tsx
// BAD: animating 200 list items simultaneously
items.map(item => <motion.div animate={{ opacity: 1 }} />)

// GOOD: only animate items in viewport
items.map(item => <ScrollRevealItem item={item} />)

// GOOD: use CSS animation for uniform motion, reserve Framer for orchestrated
items.map(item => (
  <div className="animate-fade-in" style={{ animationDelay: `${index * 30}ms` }}>
    {item.content}
  </div>
))
```

### 11.4 will-change Best Practices

```css
/* Apply only to elements about to animate */
.about-to-animate {
  will-change: transform, opacity;
}

/* Remove after animation completes */
.animation-done {
  will-change: auto;
}
```

Never apply `will-change` to more than 10-15 elements simultaneously.
Never leave it on permanently. It reserves GPU memory.

---

## 12. Integration with Memoire Specs

### 12.1 Animation Tokens in ComponentSpec

When generating specs for animated components, include animation configuration
in the spec's `tokens` or `props` section:

```json
{
  "name": "NotificationToast",
  "level": "molecule",
  "animation": {
    "enter": {
      "from": { "opacity": 0, "x": 80, "scale": 0.95 },
      "to": { "opacity": 1, "x": 0, "scale": 1 },
      "transition": { "type": "spring", "stiffness": 400, "damping": 25 }
    },
    "exit": {
      "to": { "opacity": 0, "x": 80, "scale": 0.95 },
      "transition": { "duration": 0.2, "ease": [0.4, 0, 1, 1] }
    },
    "layout": true,
    "reducedMotion": "crossfade"
  }
}
```

### 12.2 Animation Spec Fields

| Field | Type | Purpose |
|-------|------|---------|
| `animation.enter` | object | Mount animation (initial + animate) |
| `animation.exit` | object | Unmount animation |
| `animation.layout` | boolean | Enable Framer layout animation |
| `animation.reducedMotion` | string | Fallback: "none", "crossfade", "instant" |
| `animation.gesture` | object | whileHover, whileTap, drag config |
| `animation.stagger` | number | Stagger delay for child elements (seconds) |
| `animation.orchestration` | string | "beforeChildren", "afterChildren" |

---

## 13. Tailwind Animation Utilities Mapping

### 13.1 Built-in Tailwind Animations

```
animate-spin      — continuous rotation (loading spinners)
animate-ping      — expanding ring (notification indicator)
animate-pulse     — gentle opacity pulse (skeleton loading)
animate-bounce    — vertical bounce (scroll indicator)
```

### 13.2 Custom Tailwind Animation Utilities

Add to `tailwind.config.ts`:

```typescript
const config = {
  theme: {
    extend: {
      animation: {
        "fade-in": "fade-in 0.3s cubic-bezier(0.2, 0, 0, 1) both",
        "fade-out": "fade-out 0.2s cubic-bezier(0.4, 0, 1, 1) both",
        "slide-up": "slide-up 0.35s cubic-bezier(0.2, 0, 0, 1) both",
        "slide-down": "slide-down 0.35s cubic-bezier(0.2, 0, 0, 1) both",
        "slide-left": "slide-left 0.35s cubic-bezier(0.2, 0, 0, 1) both",
        "slide-right": "slide-right 0.35s cubic-bezier(0.2, 0, 0, 1) both",
        "scale-in": "scale-in 0.2s cubic-bezier(0.2, 0, 0, 1) both",
        "scale-out": "scale-out 0.15s cubic-bezier(0.4, 0, 1, 1) both",
        shimmer: "shimmer 2s ease-in-out infinite",
        "pulse-subtle": "pulse-subtle 2s ease-in-out infinite",
        shake: "shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97) both",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "fade-out": {
          from: { opacity: "1" },
          to: { opacity: "0" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-left": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "slide-right": {
          from: { opacity: "0", transform: "translateX(-16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "scale-out": {
          from: { opacity: "1", transform: "scale(1)" },
          to: { opacity: "0", transform: "scale(0.95)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
        "pulse-subtle": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-4px)" },
          "40%": { transform: "translateX(4px)" },
          "60%": { transform: "translateX(-3px)" },
          "80%": { transform: "translateX(2px)" },
        },
      },
    },
  },
};
```

### 13.3 Usage Pattern

```tsx
// CSS-only animation — no JS required
<div className="animate-fade-in">Content</div>

// With delay via style (Tailwind does not have animation-delay utilities)
<div className="animate-slide-up" style={{ animationDelay: "100ms" }}>
  Delayed content
</div>

// Stagger via inline delay
{items.map((item, i) => (
  <div
    key={item.id}
    className="animate-slide-up"
    style={{ animationDelay: `${i * 50}ms` }}
  >
    {item.content}
  </div>
))}
```

---

## 14. Common Patterns Library

### 14.1 Fade In

```tsx
// Framer Motion
const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
};

// CSS class
// animate-fade-in
```

### 14.2 Slide Up

```tsx
const slideUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 12 },
  transition: { duration: 0.35, ease: [0.2, 0, 0, 1] },
};
```

### 14.3 Scale In (Popover/Tooltip)

```tsx
const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { type: "spring", stiffness: 400, damping: 25 },
};
```

### 14.4 Stagger List

```tsx
const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.2, 0, 0, 1] },
  },
};
```

### 14.5 Pulse (Status Indicator)

```tsx
// CSS only — no Framer needed
<span className="relative flex h-3 w-3">
  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
  <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
</span>
```

### 14.6 Shimmer (Skeleton)

```tsx
<div className="h-4 w-48 animate-shimmer rounded bg-gradient-to-r from-muted via-muted/50 to-muted bg-[length:400%_100%]" />
```

### 14.7 Number Counter

```tsx
import { useSpring, motion, useMotionValue, useTransform } from "framer-motion";

function AnimatedNumber({ value }: { value: number }) {
  const motionValue = useMotionValue(0);
  const springValue = useSpring(motionValue, { stiffness: 100, damping: 20 });
  const display = useTransform(springValue, (v) => Math.round(v).toLocaleString());

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  return <motion.span>{display}</motion.span>;
}
```

### 14.8 Typewriter Effect

```tsx
function Typewriter({ text, speed = 40 }: { text: string; speed?: number }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayed(text.slice(0, i + 1));
        i++;
      } else {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span>
      {displayed}
      <motion.span
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
      >
        |
      </motion.span>
    </span>
  );
}
```

---

## 15. Anti-Patterns

### 15.1 Too Much Motion
Every element animates on mount, scroll, and hover. The page feels like a
pinball machine. Fix: reserve animation for state changes and user-initiated
actions. Static content should appear instantly.

### 15.2 Jarring Timing
A modal flies in at 600ms with a heavy bounce, then snaps shut in 50ms.
The asymmetry is disorienting. Fix: exits should be 30-50% faster than
entrances, not 90% faster. Maintain proportional timing.

### 15.3 Competing Animations
A sidebar slides in while the main content also slides, while a toast also
animates, while the header reorganizes. The user cannot track any single
change. Fix: stage animations sequentially. Primary action first, secondary
follows. Use stagger and delay, not parallelism.

### 15.4 Linear Easing Everywhere
Movement without easing feels robotic and unnatural. Every element slides
at constant speed. Fix: always apply appropriate easing. The only acceptable
use of linear is for continuous rotation (spinners) and progress bars.

### 15.5 Animating Layout Properties
Animating `width`, `height`, `margin`, `padding`, `top`, `left` causes
layout recalculation on every frame. 60fps becomes 15fps. Fix: use
`transform` and `opacity`. Use Framer Motion's `layout` prop for
automatic layout animation that handles compositing correctly.

### 15.6 Infinite Ambient Animation on Content
Continuously pulsing, rotating, or bouncing content elements. The eye
cannot settle. Fix: ambient animation belongs on status indicators and
decorative elements only. Content should be still after its entrance
animation completes.

### 15.7 Missing Exit Animations
Elements pop in smoothly but vanish instantly when removed. The lack of
exit creates a jarring cut. Fix: always define exit animations via
AnimatePresence. Even a 150ms opacity fade is better than instant removal.

### 15.8 Stagger Without Purpose
Every list uses staggerChildren even when items are already visible or
when the list has 100+ items. Fix: stagger only on first reveal. Cap
total stagger time at 600ms. For already-visible content that updates,
use layout animation instead of stagger.

### 15.9 Ignoring Reduced Motion
Elaborate animations play regardless of user preference. Users with
motion sensitivity or vestibular disorders experience discomfort. Fix:
always check `prefers-reduced-motion`. Replace spatial transforms with
opacity crossfade. Keep functional animations (spinners, progress) but
remove decorative motion.

### 15.10 Spring Without Damping Tuning
Using `type: "spring"` with default values produces wobbly, slow-settling
animation. Fix: always specify stiffness and damping. Test springs
visually. A spring that takes more than 800ms to fully settle is too soft
for UI. Increase damping or stiffness.

---

## Quick Reference Card

```
ENTERS:   ease-out    cubic-bezier(0, 0, 0.2, 1)      fast start, gentle land
EXITS:    ease-in     cubic-bezier(0.4, 0, 1, 1)      gentle start, fast leave
MOVES:    ease-both   cubic-bezier(0.4, 0, 0.2, 1)    smooth both ends
MICRO:    100-200ms   toggles, presses, hovers
STATE:    200-400ms   panels, modals, tabs
PAGE:     300-600ms   navigation, shared layout
EXIT:     30-50% faster than enter
STAGGER:  cap 600ms total, 15-80ms per item
GPU:      only transform, opacity, filter
REDUCE:   always respect prefers-reduced-motion
```
