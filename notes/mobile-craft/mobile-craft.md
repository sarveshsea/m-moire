---
name: mobile-craft
description: "Mobile-first design mastery for Memoire agents. Activates when designing screens, pages, or responsive layouts. Covers touch targets, gesture physics, responsive breakpoints, platform conventions, performance budgets, animation, accessibility, and progressive enhancement — all with concrete measurements and code."
metadata:
  category: craft
  activateOn: design-creation
  freedomLevel: high
  platforms: [ios, android, web]
  designSystems: [shadcn-ui, material-design-3, human-interface-guidelines]
---

# Mobile Craft — Production Skill

This skill governs every mobile-first design decision a Memoire agent makes. When creating screens, pages, responsive layouts, or any component that will be used on handheld devices, this skill activates and overrides desktop-first assumptions.

The principle is simple: **design for the most constrained environment first, then progressively enhance.** Every section below contains hard numbers, not guidelines. Use them as floors, not ceilings.

---

## Quick Reference — Decision Table

Use this table to make instant decisions during design and code generation.

| Situation | Decision | Rationale |
|-----------|----------|-----------|
| Primary CTA placement | Bottom of screen, full-width on mobile | Thumb zone: bottom-center is easiest reach |
| Nav pattern (<=4 items) | Bottom tab bar | iOS HIG + Material 3 both recommend this |
| Nav pattern (5+ items) | Bottom tab bar + "More" tab, or navigation drawer | Overflow pattern prevents cramped targets |
| Form inputs | Stack vertically, one per row | Side-by-side inputs fail below 375px |
| Modal/dialog on mobile | Bottom sheet or full-screen | Centered modals waste space and feel non-native |
| Data table on mobile | Card list or horizontal scroll with frozen first col | Tables don't compress below ~600px usably |
| Image gallery | Swipeable carousel with pagination dots | Grid works for >=2 columns at 375px |
| Search | Full-screen overlay on mobile | Inline search bars collapse awkwardly |
| Date picker | Native OS picker or bottom sheet calendar | Custom date pickers are accessibility nightmares on mobile |
| Dropdown with >7 options | Full-screen searchable list (Command palette) | Native selects are fine for <=7 items |
| Tooltip | Don't use on mobile | No hover state; use inline helper text instead |
| Confirmation action | Swipe-to-confirm or hold-to-confirm | Modal confirmations interrupt flow |
| Loading state | Skeleton screen | Spinners provide no spatial context |
| Error state | Inline below the field, not toast | Toasts auto-dismiss before users read them |
| Onboarding | Progressive disclosure, max 3 screens | Completion rate drops 20% per additional screen |
| Settings page | Grouped list with section headers | Follows native iOS Settings / Android preferences pattern |

---

## Touch Targets

### Hard Minimums

| Platform | Minimum Target Size | Recommended Size | Spec Source |
|----------|---------------------|------------------|-------------|
| iOS | 44 x 44 pt | 48 x 48 pt | Apple HIG |
| Android | 48 x 48 dp | 56 x 56 dp (FAB) | Material Design 3 |
| Web (WCAG 2.2) | 24 x 24 CSS px | 44 x 44 CSS px | WCAG 2.5.8 (AA) / 2.5.5 (AAA) |

### Spacing Between Targets

- **Minimum gap: 8pt / 8dp** between adjacent touch targets
- **Recommended gap: 12-16pt** for primary action rows (e.g., toolbar buttons)
- **Zero-gap is acceptable** only when the targets are visually separated by a divider or contrasting background AND each target meets the minimum size

### Thumb Zone Mapping

The thumb zone model is based on Steven Hoober's research on one-handed phone use. For a right-handed user holding a ~6.1" phone:

```
+---------------------------+
|  HARD     HARD     HARD   |   <- Top 20% of screen
|                           |
|  STRETCH  STRETCH  HARD   |   <- Upper-middle
|                           |
|  EASY     EASY   STRETCH  |   <- Lower-middle
|                           |
|  EASY     EASY     EASY   |   <- Bottom 25% of screen
+---------------------------+
```

**Design rules from this map:**
1. Primary actions go in the bottom 25% — the EASY zone
2. Navigation controls sit at the bottom edge
3. Destructive actions go in the HARD zone (top-right) — hard to reach = hard to accidentally trigger
4. Search bars can sit at top but must also be triggerable from bottom (FAB or tab bar icon)
5. Pull-to-refresh works because the top of a scrolled list naturally enters the easy zone

### Edge Target Padding

Targets near screen edges need extra inset padding because users' fingers approach from an angle:

```tsx
{/* BAD: button flush against edge */}
<button className="absolute left-0 px-2 py-3">Save</button>

{/* GOOD: minimum 16px inset from screen edge */}
<button className="absolute left-4 px-4 py-3">Save</button>
```

- **Left/right edge:** minimum 16px inset (20px preferred)
- **Bottom edge:** respect safe area inset (see Platform Conventions)
- **Top edge:** below status bar + navigation bar

### Tailwind Touch Target Utility Pattern

Use this pattern to ensure invisible touch targets meet minimums even when the visual element is smaller:

```tsx
{/* Icon button: visual size 24px, touch target 48px */}
<button className="relative flex items-center justify-center w-12 h-12">
  <Icon className="w-6 h-6" />
</button>

{/* Text link in a list: visual is text-sm but touch target is 48px tall */}
<a className="flex items-center min-h-[48px] px-4 py-3 text-sm">
  Settings
</a>

{/* Checkbox/radio with extended target */}
<label className="flex items-center gap-3 min-h-[48px] px-4 cursor-pointer">
  <input type="checkbox" className="w-5 h-5" />
  <span className="text-sm">Accept terms</span>
</label>
```

---

## Responsive Breakpoint Strategy

### Mobile-First CSS: The Only Way

Always write `min-width` breakpoints. Never start from desktop and use `max-width` to override downward.

```css
/* CORRECT: mobile-first */
.container { padding: 16px; }          /* mobile default */
@media (min-width: 640px) { ... }      /* sm: landscape phones, small tablets */
@media (min-width: 768px) { ... }      /* md: tablets */
@media (min-width: 1024px) { ... }     /* lg: laptops */
@media (min-width: 1280px) { ... }     /* xl: desktops */
@media (min-width: 1536px) { ... }     /* 2xl: large screens */

/* WRONG: desktop-first */
.container { padding: 48px; }
@media (max-width: 768px) { padding: 16px; }
```

### Tailwind Breakpoint System

| Breakpoint | Min-width | Typical Devices | Column Grid |
|------------|-----------|-----------------|-------------|
| (default) | 0px | Phones portrait (320-430px) | 4 columns |
| `sm:` | 640px | Phones landscape, small tablets | 4 columns |
| `md:` | 768px | Tablets portrait (iPad Mini, Air) | 8 columns |
| `lg:` | 1024px | Tablets landscape, small laptops | 12 columns |
| `xl:` | 1280px | Laptops, desktops | 12 columns |
| `2xl:` | 1536px | Large desktops | 12 columns |

### Content Choreography

Content choreography defines what happens to each element at each breakpoint. Map every element:

| Element | Mobile (default) | sm/md | lg+ |
|---------|-----------------|-------|-----|
| Hero image | Full-width, 200px tall | Full-width, 300px | 50% width, 400px |
| Nav | Bottom tab bar | Bottom tab bar | Sidebar |
| Sidebar filters | Hidden, bottom sheet | Hidden, bottom sheet | Visible sidebar |
| Card grid | 1 column, stacked | 2 columns | 3-4 columns |
| Data table | Card list | Horizontal scroll | Full table |
| Footer links | Accordion sections | 2-column grid | 4-column row |
| Breadcrumbs | Hidden (back button) | Truncated | Full path |
| Secondary actions | Overflow menu (...) | Overflow menu | Visible buttons |

```tsx
{/* Card grid with content choreography */}
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>

{/* Sidebar that becomes bottom sheet on mobile */}
<aside className="
  fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-background
  md:static md:inset-auto md:z-auto md:rounded-none md:w-64 md:border-r
">
  <FilterPanel />
</aside>

{/* Nav: bottom tabs on mobile, sidebar on desktop */}
<nav className="
  fixed inset-x-0 bottom-0 z-50 flex h-16 items-center justify-around border-t bg-background
  lg:static lg:inset-auto lg:h-auto lg:w-60 lg:flex-col lg:items-stretch lg:justify-start lg:border-r lg:border-t-0 lg:py-4
">
  {navItems.map(item => <NavItem key={item.href} {...item} />)}
</nav>
```

### Image Strategy

```tsx
{/* Art direction: different crops for different viewports */}
<picture>
  <source
    media="(min-width: 1024px)"
    srcSet="/hero-wide-1024.webp 1024w, /hero-wide-1536.webp 1536w"
    sizes="100vw"
  />
  <source
    media="(min-width: 640px)"
    srcSet="/hero-medium-640.webp 640w, /hero-medium-960.webp 960w"
    sizes="100vw"
  />
  <img
    src="/hero-mobile-430.webp"
    srcSet="/hero-mobile-320.webp 320w, /hero-mobile-430.webp 430w"
    sizes="100vw"
    alt="Hero description"
    className="w-full h-auto object-cover"
    loading="eager"
    fetchPriority="high"
    decoding="async"
  />
</picture>

{/* Below-the-fold images: lazy load with blur placeholder */}
<div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
  <img
    src="/photo.webp"
    srcSet="/photo-320.webp 320w, /photo-640.webp 640w, /photo-960.webp 960w"
    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
    alt="Description"
    loading="lazy"
    decoding="async"
    className="absolute inset-0 w-full h-full object-cover"
  />
</div>
```

### Fluid Typography

Use `clamp()` for typography that scales smoothly between breakpoints:

```tsx
{/* Heading: 24px at 320px viewport, scales to 48px at 1280px */}
<h1 className="text-[clamp(1.5rem,1rem+2.5vw,3rem)] font-bold leading-tight tracking-tight">
  Page Title
</h1>

{/* Body: 14px at 320px, scales to 18px at 1280px */}
<p className="text-[clamp(0.875rem,0.8rem+0.4vw,1.125rem)] leading-relaxed">
  Body text that remains readable at every viewport width.
</p>

{/* Caption: fixed at 12px — don't fluid-scale small text */}
<span className="text-xs text-muted-foreground">Caption text</span>
```

**Rules for fluid type:**
- Minimum font size: 14px for body text (never go below 12px for any readable text)
- Maximum scaling range: 1.5x-2x of the minimum
- Line height: 1.4-1.6 for body, 1.1-1.2 for headings
- Don't fluid-scale text below 14px — it becomes unreadable at the small end
- Set a `max-width` on text containers: `max-w-prose` (65ch) for readability

---

## Gesture Patterns

### Swipe (Horizontal)

Used for: carousel navigation, dismissing cards, revealing actions (swipe-to-delete).

| Parameter | Value | Notes |
|-----------|-------|-------|
| Activation threshold | 30% of element width OR 80px | Whichever is smaller |
| Velocity threshold | 0.5px/ms | Fast swipes complete even below distance threshold |
| Cancel zone | <15% and velocity <0.3px/ms | Snap back to original position |
| Rubber-band resistance | 0.55 factor | When swiping past bounds, movement = finger * 0.55 |
| Animation duration | 200-300ms | Use spring physics, not linear |

```tsx
{/* Swipe-to-reveal action pattern (conceptual — use with a gesture library like framer-motion) */}
<motion.div
  drag="x"
  dragConstraints={{ left: -120, right: 0 }}
  dragElastic={0.2}
  onDragEnd={(_, info) => {
    if (info.offset.x < -80 || info.velocity.x < -0.5) {
      onRevealActions();
    }
  }}
  className="relative flex items-center bg-background"
>
  <ListItem />
</motion.div>

{/* Behind the swipeable item */}
<div className="absolute inset-y-0 right-0 flex items-center gap-0">
  <button className="flex h-full w-20 items-center justify-center bg-amber-500 text-white">
    <ArchiveIcon className="w-5 h-5" />
  </button>
  <button className="flex h-full w-20 items-center justify-center bg-destructive text-destructive-foreground">
    <TrashIcon className="w-5 h-5" />
  </button>
</div>
```

### Swipe (Vertical)

Used for: scrolling, pull-to-refresh, bottom sheet drag.

| Parameter | Value |
|-----------|-------|
| Scroll momentum | Deceleration rate 0.998 (iOS default) |
| Overscroll bounce | 0.55 rubber-band factor |
| Pull-to-refresh trigger | 80px pull distance |
| Scroll snap | CSS `scroll-snap-type: y mandatory` for full-page sections |

### Pull to Refresh

```tsx
{/* CSS-only pull-to-refresh indicator position */}
<div className="relative overflow-hidden">
  {/* Refresh indicator — translate down as user pulls */}
  <div className={cn(
    "absolute inset-x-0 top-0 flex items-center justify-center h-16 -translate-y-full transition-transform",
    isPulling && "translate-y-0",
    isRefreshing && "translate-y-0"
  )}>
    <Loader2 className={cn("w-5 h-5 text-muted-foreground", isRefreshing && "animate-spin")} />
  </div>

  {/* Scrollable content */}
  <div className="overflow-y-auto">
    {children}
  </div>
</div>
```

### Long Press

| Parameter | Value | Notes |
|-----------|-------|-------|
| Activation delay | 500ms | iOS and Android standard |
| Visual feedback start | 200ms | Background color change or scale begins |
| Haptic feedback | At 500ms | UIImpactFeedbackGenerator.medium (iOS) |
| Cancel on move | >10px movement cancels | Prevents accidental activation during scroll |

```tsx
{/* Long press with visual feedback */}
<button
  onPointerDown={startLongPress}
  onPointerUp={cancelLongPress}
  onPointerLeave={cancelLongPress}
  className={cn(
    "relative overflow-hidden rounded-lg p-4 transition-transform duration-200",
    isPressed && "scale-95",
    isLongPressed && "scale-90 bg-accent"
  )}
>
  {/* Radial fill animation during press */}
  <span className={cn(
    "absolute inset-0 bg-accent/50 rounded-full scale-0 transition-transform duration-500",
    isPressed && "scale-150"
  )} />
  <span className="relative z-10">{children}</span>
</button>
```

### Pinch to Zoom

- **Allow** on: images, maps, diagrams, photos
- **Prevent** on: UI chrome, text content, form pages
- Never disable viewport zoom globally (`user-scalable=no` is an accessibility violation)
- When implementing custom pinch-zoom, clamp scale between 1x and 5x
- Provide a reset/fit button for zoomed content

### Bottom Sheet Physics

| Parameter | Value |
|-----------|-------|
| Snap points | Collapsed (0%), Half (50%), Expanded (90%) |
| Drag handle size | 32px wide x 4px tall, centered, 8px from top |
| Velocity dismissal | >1px/ms downward velocity = dismiss |
| Backdrop opacity | 0 at collapsed, 0.5 at expanded |
| Corner radius | 16px top-left, top-right |
| Over-drag resistance | 0.4 factor above top snap point |

```tsx
{/* Bottom sheet with snap points — shadcn/ui Drawer */}
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";

<Drawer>
  <DrawerTrigger asChild>
    <Button variant="outline">Open Filters</Button>
  </DrawerTrigger>
  <DrawerContent className="max-h-[90vh]">
    <DrawerHeader>
      <DrawerTitle>Filters</DrawerTitle>
    </DrawerHeader>
    <div className="overflow-y-auto px-4 pb-8">
      {/* Filter content — scrollable within the sheet */}
      <FilterForm />
    </div>
  </DrawerContent>
</Drawer>
```

---

## Platform Conventions

### iOS — Human Interface Guidelines

#### Navigation Architecture

```
+--[ Status Bar: 54pt (notch) / 47pt (Dynamic Island) ]--+
|                                                          |
|  +--[ Navigation Bar: 44pt ]--+                         |
|  |  < Back         Title    Edit |                      |
|  +--------------------------------+                     |
|                                                          |
|  [ Content Area ]                                        |
|  - Safe area insets: top varies, bottom 34pt (home bar) |
|  - Content should extend behind bars with blur          |
|                                                          |
|  +--[ Tab Bar: 49pt + 34pt home indicator ]--+          |
|  |  Home   Search  Library  Profile           |          |
|  +--------------------------------------------+          |
+----------------------------------------------------------+
```

**Key measurements (points):**
- Status bar height: 54pt (devices with notch), 47pt (Dynamic Island)
- Navigation bar: 44pt standard
- Tab bar: 49pt + 34pt home indicator = 83pt total
- Large title navigation bar: 96pt (collapses to 44pt on scroll)
- Safe area bottom: 34pt (home indicator devices), 0pt (home button devices)
- Minimum tappable area: 44 x 44pt

**Navigation patterns:**
1. **Tab bar (primary):** Max 5 tabs. Label + icon always. No more than 5 — use "More" tab for overflow.
2. **Navigation stack:** Push/pop with back gesture (swipe from left edge, 20pt trigger zone).
3. **Modal presentation:** Sheet with detents (`.medium` = ~50%, `.large` = ~92%). Always include a dismiss affordance.
4. **Search:** Pull down on scrollable content to reveal search bar.

**Typography — San Francisco:**

| Style | Size | Weight | Leading |
|-------|------|--------|---------|
| Large Title | 34pt | Bold | 41pt |
| Title 1 | 28pt | Bold | 34pt |
| Title 2 | 22pt | Bold | 28pt |
| Title 3 | 20pt | Semibold | 25pt |
| Headline | 17pt | Semibold | 22pt |
| Body | 17pt | Regular | 22pt |
| Callout | 16pt | Regular | 21pt |
| Subheadline | 15pt | Regular | 20pt |
| Footnote | 13pt | Regular | 18pt |
| Caption 1 | 12pt | Regular | 16pt |
| Caption 2 | 11pt | Regular | 13pt |

**Dynamic Type support:** All text must scale. Test at these extremes:
- `xSmall` (accessibility): body becomes 14pt
- `xxxLarge` (accessibility): body becomes 53pt
- Never use fixed heights on text containers

**Haptic feedback types:**

| Type | When to use | UIKit API |
|------|-------------|-----------|
| Light impact | Toggle, switch, minor selection | `UIImpactFeedbackGenerator(style: .light)` |
| Medium impact | Action button tap, snap to position | `UIImpactFeedbackGenerator(style: .medium)` |
| Heavy impact | Significant action, drop into place | `UIImpactFeedbackGenerator(style: .heavy)` |
| Success notification | Task completed | `UINotificationFeedbackGenerator(.success)` |
| Warning notification | Destructive action about to happen | `UINotificationFeedbackGenerator(.warning)` |
| Error notification | Action failed | `UINotificationFeedbackGenerator(.error)` |
| Selection changed | Scrolling through picker values | `UISelectionFeedbackGenerator()` |

### Android — Material Design 3

#### Navigation Architecture

```
+--[ Status Bar: 24dp ]--+
|                          |
|  +--[ Top App Bar: 64dp (small) / 152dp (large) ]--+
|  |  <- Nav   Title                      Search  More |
|  +----------------------------------------------------+
|                                                        |
|  [ Content Area ]                                      |
|  - Edge-to-edge: content draws behind system bars     |
|  - System bar insets from WindowInsetsCompat           |
|                                                        |
|  +--[ Navigation Bar: 80dp ]--+                       |
|  |  Home   Search  Library  Profile |                  |
|  +-----------------------------------+                 |
|                                                        |
|  +--[ System Nav Bar: 48dp (gesture) / varying ]--+   |
+--------------------------------------------------------+
```

**Key measurements (dp):**
- Status bar: 24dp (can vary)
- Top app bar (small): 64dp
- Top app bar (medium): 112dp
- Top app bar (large): 152dp
- Navigation bar: 80dp
- Navigation rail (medium screens): 80dp wide
- Navigation drawer: 360dp wide max
- FAB: 56dp (standard), 96dp (large), 40dp (small)
- FAB margin from edge: 16dp
- Minimum tappable area: 48 x 48dp

**Adaptive layout system (Window Size Classes):**

| Width Class | Breakpoint | Navigation | Panes |
|-------------|------------|------------|-------|
| Compact | < 600dp | Bottom navigation bar | Single pane |
| Medium | 600-839dp | Navigation rail | Single pane or list-detail |
| Expanded | >= 840dp | Navigation drawer (persistent) | Two panes (list-detail) |

**Material 3 Type Scale:**

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Display Large | 57sp | Regular | 64sp |
| Display Medium | 45sp | Regular | 52sp |
| Display Small | 36sp | Regular | 44sp |
| Headline Large | 32sp | Regular | 40sp |
| Headline Medium | 28sp | Regular | 36sp |
| Headline Small | 24sp | Regular | 32sp |
| Title Large | 22sp | Regular | 28sp |
| Title Medium | 16sp | Medium | 24sp |
| Title Small | 14sp | Medium | 20sp |
| Body Large | 16sp | Regular | 24sp |
| Body Medium | 14sp | Regular | 20sp |
| Body Small | 12sp | Regular | 16sp |
| Label Large | 14sp | Medium | 20sp |
| Label Medium | 12sp | Medium | 16sp |
| Label Small | 11sp | Medium | 16sp |

**Predictive back gesture:**
- System back gesture triggers from either screen edge (unlike iOS left-only)
- Preview of the destination shows during the gesture
- Apps must not override or intercept the system back gesture for navigation
- Custom back handling uses `OnBackPressedCallback`

---

## Performance Patterns

### Loading States

```tsx
{/* Skeleton screen — matches final layout structure */}
function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      {/* Image placeholder */}
      <div className="aspect-video rounded-md bg-muted animate-pulse" />
      {/* Title */}
      <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
      {/* Description lines */}
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-muted animate-pulse" />
        <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
      </div>
      {/* Meta row */}
      <div className="flex items-center gap-2 pt-2">
        <div className="h-6 w-6 rounded-full bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  );
}

{/* Skeleton grid — show immediately, replace with real content */}
function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}
```

### Optimistic UI Updates

```tsx
{/* Optimistic like button — updates instantly, rolls back on failure */}
function LikeButton({ postId, initialLiked, initialCount }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);

  async function toggleLike() {
    // Optimistic update
    const wasLiked = liked;
    const prevCount = count;
    setLiked(!wasLiked);
    setCount(wasLiked ? prevCount - 1 : prevCount + 1);

    try {
      await api.toggleLike(postId);
    } catch {
      // Rollback
      setLiked(wasLiked);
      setCount(prevCount);
    }
  }

  return (
    <button
      onClick={toggleLike}
      className={cn(
        "flex items-center gap-1.5 min-h-[48px] px-3 rounded-full transition-colors",
        liked ? "text-red-500" : "text-muted-foreground"
      )}
    >
      <HeartIcon className={cn("w-5 h-5", liked && "fill-current")} />
      <span className="text-sm tabular-nums">{count}</span>
    </button>
  );
}
```

### Virtualized Infinite Scroll

```tsx
{/* Intersection Observer-based infinite scroll */}
function InfiniteList({ fetchPage }: { fetchPage: (page: number) => Promise<Item[]> }) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore) {
          loadMore();
        }
      },
      { rootMargin: "200px" } // Start loading 200px before sentinel is visible
    );

    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [page, hasMore]);

  async function loadMore() {
    const newItems = await fetchPage(page + 1);
    if (newItems.length === 0) {
      setHasMore(false);
      return;
    }
    setItems(prev => [...prev, ...newItems]);
    setPage(prev => prev + 1);
  }

  return (
    <div className="divide-y">
      {items.map(item => <ListItem key={item.id} item={item} />)}
      {hasMore && (
        <div ref={sentinelRef} className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {!hasMore && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No more items
        </p>
      )}
    </div>
  );
}
```

### Performance Budgets

| Metric | Target | Ceiling (fail) |
|--------|--------|-----------------|
| First Contentful Paint (FCP) | < 1.8s | 3.0s |
| Largest Contentful Paint (LCP) | < 2.5s | 4.0s |
| First Input Delay (FID) | < 100ms | 300ms |
| Interaction to Next Paint (INP) | < 200ms | 500ms |
| Cumulative Layout Shift (CLS) | < 0.1 | 0.25 |
| Total Blocking Time (TBT) | < 200ms | 600ms |
| Initial JS bundle | < 200KB gzipped | 350KB gzipped |
| Initial CSS | < 50KB gzipped | 100KB gzipped |
| Hero image | < 200KB | 500KB |
| Web font | < 50KB per weight | 100KB |
| Time to Interactive (TTI) | < 3.8s on 4G | 7.3s |

**Mobile network simulation for testing:**
- Slow 3G: 400ms RTT, 400kbps down, 400kbps up
- Fast 3G: 150ms RTT, 1.6Mbps down, 750kbps up
- Regular 4G: 170ms RTT, 9Mbps down, 9Mbps up

---

## Animation & Motion

### Duration Scale

| Category | Duration | Use Case |
|----------|----------|----------|
| Instant | 0-100ms | Color changes, opacity toggles |
| Micro | 100-200ms | Button press, toggle switch, checkbox |
| Short | 200-300ms | Menu open, tooltip appear, accordion |
| Medium | 300-500ms | Page transitions, modal open, bottom sheet |
| Long | 500-800ms | Complex choreography, onboarding |
| Extra-long | 800ms+ | Almost never — only for delight animations |

### Easing Functions

| Easing | CSS Value | When to Use |
|--------|-----------|-------------|
| Ease-out | `cubic-bezier(0.0, 0.0, 0.2, 1)` | Elements entering the screen |
| Ease-in | `cubic-bezier(0.4, 0.0, 1, 1)` | Elements leaving the screen |
| Ease-in-out | `cubic-bezier(0.4, 0.0, 0.2, 1)` | Elements moving on screen (position change) |
| Spring | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | Playful enters, bounces, snaps |
| Linear | `linear` | Continuous animations (loading spinners, progress bars) |
| Sharp | `cubic-bezier(0.4, 0.0, 0.6, 1)` | Elements that leave and don't return |

### Reduced Motion

```tsx
{/* ALWAYS provide reduced motion alternatives */}
<div className="
  transition-all duration-300 ease-out
  motion-reduce:transition-none motion-reduce:duration-0
">
  {/* Content with animation */}
</div>

{/* Animated entrance — skip for reduced motion users */}
<div className="
  animate-in fade-in slide-in-from-bottom-4 duration-300
  motion-reduce:animate-none
">
  {children}
</div>

{/* Programmatic check */}
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
```

### Performance-Safe Animation Properties

Only animate these properties — they trigger GPU compositing and avoid layout/paint:

| Safe (Composite only) | Unsafe (Trigger Layout) | Unsafe (Trigger Paint) |
|----------------------|------------------------|----------------------|
| `transform` | `width`, `height` | `background-color` |
| `opacity` | `top`, `left`, `right`, `bottom` | `border-color` |
| `filter` | `margin`, `padding` | `box-shadow` |
| `clip-path` | `font-size` | `outline` |
| `will-change` (use sparingly) | `display`, `flex` | `color` |

```tsx
{/* GOOD: animate with transform */}
<div className="transition-transform duration-200 hover:scale-105 active:scale-95" />

{/* BAD: animate with width */}
<div className="transition-all duration-200 hover:w-64" />

{/* GOOD: slide in with translate */}
<div className="translate-y-4 opacity-0 animate-in fade-in slide-in-from-bottom-4 duration-300" />

{/* BAD: slide in with top */}
<div className="relative top-4 opacity-0 transition-all" />
```

### Page Transition Patterns

```tsx
{/* Shared axis transition (Material): forward = slide left + fade */}
const pageVariants = {
  enter: {
    x: 20,
    opacity: 0,
  },
  center: {
    x: 0,
    opacity: 1,
    transition: { duration: 0.3, ease: [0.0, 0.0, 0.2, 1] },
  },
  exit: {
    x: -20,
    opacity: 0,
    transition: { duration: 0.25, ease: [0.4, 0.0, 1, 1] },
  },
};

{/* Cross-fade for tab switches (no spatial direction) */}
const tabVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
};
```

---

## Progressive Enhancement

### Core Content Without JS

Every page must be functional (readable, navigable) without JavaScript. JS enhances, not enables:

```tsx
{/* Navigation works without JS via native anchor links */}
<nav>
  <a href="/home" className="...">Home</a>
  <a href="/search" className="...">Search</a>
</nav>

{/* Accordion works without JS using details/summary */}
<details className="group border-b">
  <summary className="flex cursor-pointer items-center justify-between py-4 text-sm font-medium">
    <span>Frequently asked question</span>
    <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
  </summary>
  <div className="pb-4 text-sm text-muted-foreground">
    Answer content that is revealed without JavaScript.
  </div>
</details>

{/* Forms submit natively, JS enhances with validation */}
<form action="/api/submit" method="POST">
  <input name="email" type="email" required className="..." />
  <button type="submit" className="...">Submit</button>
</form>
```

### Input Adaptation

```tsx
{/* Numeric input: shows number pad on mobile */}
<input type="text" inputMode="numeric" pattern="[0-9]*" className="..." />

{/* Email: shows @ keyboard */}
<input type="email" inputMode="email" autoComplete="email" className="..." />

{/* Phone: shows phone dialer */}
<input type="tel" inputMode="tel" autoComplete="tel" className="..." />

{/* URL: shows .com keyboard */}
<input type="url" inputMode="url" autoComplete="url" className="..." />

{/* Search: shows Search key instead of Enter */}
<input type="search" enterKeyHint="search" className="..." />

{/* Currency amount: decimal number pad */}
<input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" className="..." />

{/* One-time code (OTP): triggers SMS autofill */}
<input
  type="text"
  inputMode="numeric"
  autoComplete="one-time-code"
  pattern="[0-9]{6}"
  maxLength={6}
  className="..."
/>
```

### Network-Aware Loading

```tsx
{/* Adapt to network conditions */}
function useNetworkQuality() {
  const [quality, setQuality] = useState<"high" | "medium" | "low">("high");

  useEffect(() => {
    const conn = (navigator as any).connection;
    if (!conn) return;

    function update() {
      const { effectiveType, saveData } = conn;
      if (saveData || effectiveType === "slow-2g" || effectiveType === "2g") {
        setQuality("low");
      } else if (effectiveType === "3g") {
        setQuality("medium");
      } else {
        setQuality("high");
      }
    }

    update();
    conn.addEventListener("change", update);
    return () => conn.removeEventListener("change", update);
  }, []);

  return quality;
}

{/* Usage: load appropriate assets based on network */}
function HeroImage() {
  const quality = useNetworkQuality();

  return (
    <img
      src={
        quality === "high" ? "/hero-2x.webp" :
        quality === "medium" ? "/hero-1x.webp" :
        "/hero-placeholder.webp"
      }
      alt="Hero"
      className="w-full aspect-video object-cover"
    />
  );
}
```

### Offline-First Patterns

```tsx
{/* Service worker cache strategy map */}
const CACHE_STRATEGIES = {
  // App shell: cache first, update in background
  shell: "stale-while-revalidate",

  // API data: network first, fall back to cache
  api: "network-first",

  // Static assets (fonts, icons): cache only after first load
  assets: "cache-first",

  // User-generated content images: cache first with expiry
  images: "cache-first-with-expiry",

  // HTML pages: network first with offline fallback
  pages: "network-first-with-offline-fallback",
};

{/* Offline indicator component */}
function OfflineBar() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 flex items-center justify-center bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950">
      You are offline. Changes will sync when you reconnect.
    </div>
  );
}
```

---

## Accessibility on Mobile

### Focus Order and Screen Readers

```tsx
{/* Semantic heading hierarchy — screen readers navigate by headings */}
<main>
  <h1>Page Title</h1>           {/* One per page */}
  <section aria-labelledby="section-1">
    <h2 id="section-1">Section</h2>
    <h3>Subsection</h3>
  </section>
</main>

{/* Skip to content link — first focusable element */}
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg focus:ring-2 focus:ring-ring"
>
  Skip to content
</a>

{/* Live regions for dynamic content updates */}
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {statusMessage}
</div>

{/* Announce loading states */}
<div role="status" aria-live="polite">
  {isLoading ? (
    <span className="sr-only">Loading results...</span>
  ) : (
    <span className="sr-only">{items.length} results found</span>
  )}
</div>
```

### Dynamic Type / Font Scaling

Test every screen at 200% font size. Things that break:

| Problem | Solution |
|---------|----------|
| Text overflows fixed container | Use `min-height` not `height`; use `overflow-wrap: break-word` |
| Buttons become too tall for nav bar | Allow nav bar height to grow, or use scroll |
| Two-column layout collapses awkwardly | At very large font sizes, stack to single column |
| Icons misalign with scaled text | Use `em` units for icon sizes, or `flex` with `items-center` |
| Truncated text loses meaning | Prefer wrapping over truncation for critical text |

```tsx
{/* Flex layout that handles font scaling */}
<button className="inline-flex items-center gap-2 rounded-lg px-4 py-2 min-h-[44px]">
  <PlusIcon className="w-[1.25em] h-[1.25em] shrink-0" />
  <span className="text-sm leading-tight">Add Item</span>
</button>
```

### Orientation

- **Never lock to portrait.** Users with motor disabilities may mount their device in landscape.
- Test all layouts in both orientations
- Use `@media (orientation: landscape)` for layout adjustments, not JS orientation lock

```tsx
{/* Landscape-aware layout */}
<div className="
  flex flex-col gap-4
  landscape:flex-row landscape:items-start
">
  <div className="landscape:w-1/2">Image</div>
  <div className="landscape:w-1/2">Content</div>
</div>
```

### Color Contrast

| Level | Ratio | Applies To |
|-------|-------|------------|
| AA (minimum) | 4.5:1 | Normal text (< 18pt / < 14pt bold) |
| AA large text | 3:1 | Large text (>= 18pt / >= 14pt bold) |
| AAA (preferred) | 7:1 | All body text |
| Non-text elements | 3:1 | Icons, borders, form controls, focus indicators |

**Mobile-specific contrast concerns:**
- Outdoor use under sunlight demands higher contrast than indoor use
- Prefer 7:1 for any text the user must read to complete a task
- Semi-transparent overlays on images: add a solid background or gradient scrim

```tsx
{/* Image overlay with guaranteed contrast */}
<div className="relative">
  <img src="/photo.webp" alt="" className="w-full" />
  {/* Gradient scrim ensures text readability regardless of image content */}
  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
  <div className="absolute bottom-0 inset-x-0 p-4">
    <h3 className="text-lg font-bold text-white">Title</h3>
    <p className="text-sm text-white/90">Subtitle text</p>
  </div>
</div>
```

---

## Anti-Patterns — What Not to Do

### 1. Desktop-First Responsive

**Wrong:** Design a 1440px layout, then squeeze it into 375px.
**Why it fails:** You end up hiding features, cramming content, and creating a degraded experience.
**Right:** Design at 375px first. Every pixel earned on larger screens is additive.

### 2. Hover-Dependent Interactions

**Wrong:** Showing information only on hover (tooltips, preview cards, dropdown menus).
**Why it fails:** Touchscreens have no hover state. `:hover` fires on tap on mobile and sticks until the user taps elsewhere.
**Right:** Use inline text, expandable sections, or tap-to-reveal. If you must use hover for desktop, provide a tap alternative:

```tsx
{/* Hover on desktop, tap on mobile */}
<div className="group relative">
  <button className="peer">Info</button>
  {/* Shows on hover (desktop) or focus (keyboard/mobile) */}
  <div className="
    invisible absolute opacity-0 transition-opacity
    group-hover:visible group-hover:opacity-100
    peer-focus:visible peer-focus:opacity-100
  ">
    Tooltip content
  </div>
</div>
```

### 3. Critical Actions in Unreachable Zones

**Wrong:** Primary action buttons in the top-right corner.
**Right:** Primary actions in the bottom 25% of the screen, ideally full-width or centered.

### 4. Fixed-Width Layouts

**Wrong:** `width: 375px` or `max-width: 430px` on body content.
**Right:** Fluid widths with `max-width` only for readability constraints:

```tsx
<main className="mx-auto w-full max-w-lg px-4">
  {/* Content reflows to any width */}
</main>
```

### 5. Disabling Pinch-to-Zoom

**Wrong:** `<meta name="viewport" content="user-scalable=no, maximum-scale=1">`.
**Why it fails:** Violates WCAG 1.4.4. Users with low vision depend on zoom.
**Right:** `<meta name="viewport" content="width=device-width, initial-scale=1">`. Nothing more.

### 6. Full-Screen Modals That Trap

**Wrong:** Modals that cover the entire screen with no visible dismiss button, especially for non-critical confirmations.
**Right:** Bottom sheet (Drawer) or a modal with obvious close button AND swipe-to-dismiss:

```tsx
{/* Mobile-appropriate dialog using shadcn/ui */}
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerClose } from "@/components/ui/drawer";

{/* On mobile: bottom sheet. On desktop: centered dialog. */}
function ResponsiveModal({ children, title, open, onOpenChange }: Props) {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-8">{children}</div>
      </DrawerContent>
    </Drawer>
  );
}
```

### 7. Lazy Loading Above-the-Fold Content

**Wrong:** `loading="lazy"` on the hero image or any content visible in the initial viewport.
**Right:** `loading="eager"` + `fetchPriority="high"` for above-the-fold images. Lazy load everything else.

---

## shadcn/ui Mobile Patterns

### Sheet as Bottom Sheet

```tsx
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

{/* Side sheet on desktop, bottom sheet on mobile */}
<Sheet>
  <SheetTrigger asChild>
    <Button variant="outline" size="sm">
      <FilterIcon className="w-4 h-4 mr-2" />
      Filters
    </Button>
  </SheetTrigger>
  <SheetContent
    side="bottom"         // bottom on all viewports
    className="max-h-[85vh] rounded-t-2xl md:max-h-none md:rounded-none md:side-right"
  >
    <SheetHeader>
      <SheetTitle>Filters</SheetTitle>
    </SheetHeader>
    <div className="overflow-y-auto py-4">
      <FilterForm />
    </div>
  </SheetContent>
</Sheet>
```

### Drawer for Mobile Navigation

```tsx
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";

<Drawer>
  <DrawerTrigger asChild>
    <Button variant="ghost" size="icon" className="lg:hidden min-h-[48px] min-w-[48px]">
      <MenuIcon className="w-5 h-5" />
      <span className="sr-only">Open menu</span>
    </Button>
  </DrawerTrigger>
  <DrawerContent className="max-h-[90vh]">
    <nav className="flex flex-col gap-1 p-4">
      {navItems.map(item => (
        <a
          key={item.href}
          href={item.href}
          className="flex items-center gap-3 rounded-lg px-3 min-h-[48px] text-sm hover:bg-accent"
        >
          <item.icon className="w-5 h-5 shrink-0" />
          {item.label}
        </a>
      ))}
    </nav>
  </DrawerContent>
</Drawer>
```

### Command Palette — Full Screen on Mobile

```tsx
import { CommandDialog, CommandInput, CommandList, CommandItem, CommandGroup } from "@/components/ui/command";

<CommandDialog open={open} onOpenChange={setOpen}>
  <div className="
    fixed inset-0 z-50 bg-background
    sm:inset-auto sm:top-[20%] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg sm:rounded-xl sm:border sm:shadow-2xl
  ">
    <CommandInput
      placeholder="Search..."
      className="min-h-[48px] text-base" // text-base prevents iOS zoom on focus
    />
    <CommandList className="max-h-[calc(100vh-120px)] sm:max-h-[300px]">
      <CommandGroup heading="Recent">
        {items.map(item => (
          <CommandItem key={item.id} className="min-h-[48px] px-4">
            {item.label}
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  </div>
</CommandDialog>
```

### Dialog — Slides Up on Mobile

```tsx
{/* Override Dialog animation for mobile: slide from bottom instead of center fade */}
<DialogContent className="
  fixed z-50 bg-background
  /* Mobile: full-width bottom sheet style */
  inset-x-0 bottom-0 top-auto rounded-t-2xl border-t p-6
  translate-y-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom
  data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom
  /* Desktop: centered dialog */
  sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2
  sm:max-w-md sm:rounded-xl sm:border
  sm:data-[state=open]:slide-in-from-bottom-0 sm:data-[state=open]:fade-in
  sm:data-[state=closed]:slide-out-to-bottom-0 sm:data-[state=closed]:fade-out
">
  {children}
</DialogContent>
```

### Input Fields — Preventing iOS Zoom

iOS Safari zooms in when a focused input has font-size below 16px. Prevent this without disabling user zoom:

```tsx
{/* ALWAYS use text-base (16px) or larger for inputs on mobile */}
<input
  type="text"
  className="w-full rounded-lg border px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
  placeholder="Enter text..."
/>

{/* For shadcn/ui Input: override the default text-sm */}
<Input className="text-base sm:text-sm" placeholder="Search..." />

{/* Select: same rule */}
<Select>
  <SelectTrigger className="text-base sm:text-sm min-h-[48px]">
    <SelectValue placeholder="Choose option" />
  </SelectTrigger>
  <SelectContent>
    {options.map(opt => (
      <SelectItem key={opt.value} value={opt.value} className="min-h-[48px] text-base sm:text-sm">
        {opt.label}
      </SelectItem>
    ))}
  </SelectContent>
</Select>
```

### Popover — Full Width on Mobile

```tsx
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

<Popover>
  <PopoverTrigger asChild>
    <Button variant="outline">Select date</Button>
  </PopoverTrigger>
  <PopoverContent
    className="
      w-screen rounded-t-2xl border-t p-0
      sm:w-auto sm:rounded-xl sm:border
    "
    align="start"
    side="bottom"
    sideOffset={4}
  >
    <Calendar mode="single" selected={date} onSelect={setDate} />
  </PopoverContent>
</Popover>
```

---

## Mobile Layout Recipes

### Safe Area Handling

```tsx
{/* Root layout with safe area padding */}
<div className="
  min-h-screen
  pt-[env(safe-area-inset-top)]
  pr-[env(safe-area-inset-right)]
  pb-[env(safe-area-inset-bottom)]
  pl-[env(safe-area-inset-left)]
">
  {children}
</div>

{/* Fixed bottom bar that respects safe area */}
<div className="
  fixed inset-x-0 bottom-0 z-50
  border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
  pb-[env(safe-area-inset-bottom)]
">
  <div className="flex h-16 items-center justify-around px-4">
    {tabs}
  </div>
</div>

{/* Account for fixed bottom bar in scroll content */}
<main className="pb-[calc(4rem+env(safe-area-inset-bottom))]">
  {scrollableContent}
</main>
```

### Sticky Header with Scroll Behavior

```tsx
{/* Header that shrinks on scroll */}
<header className="
  sticky top-0 z-40
  border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
  transition-all duration-200
">
  {/* Large title state */}
  <div className="px-4 py-2">
    <div className="flex items-center justify-between min-h-[44px]">
      <h1 className="text-2xl font-bold tracking-tight">Inbox</h1>
      <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
        <ComposeIcon className="w-5 h-5" />
      </Button>
    </div>
  </div>
</header>
```

### Pull-Down Search Bar (iOS Pattern)

```tsx
{/* Search bar hidden above scroll, revealed by pulling down */}
<div className="overflow-y-auto">
  {/* Search sits above the list, scrolled out of view initially */}
  <div className="px-4 py-2">
    <div className="relative">
      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search"
        className="pl-10 text-base rounded-xl bg-muted border-0 min-h-[44px]"
      />
    </div>
  </div>

  {/* List content */}
  <div className="divide-y">
    {items.map(item => <ListRow key={item.id} {...item} />)}
  </div>
</div>
```

### Tab Bar with Badge

```tsx
function TabBar({ items, activeTab }: TabBarProps) {
  return (
    <nav className="
      fixed inset-x-0 bottom-0 z-50
      border-t bg-background
      pb-[env(safe-area-inset-bottom)]
    ">
      <div className="flex h-16 items-end justify-around px-2">
        {items.map(item => (
          <a
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-w-[64px] min-h-[48px] px-2",
              "text-muted-foreground transition-colors",
              activeTab === item.id && "text-primary"
            )}
          >
            <div className="relative">
              <item.icon className="w-6 h-6" />
              {item.badge && item.badge > 0 && (
                <span className="
                  absolute -top-1.5 -right-2 flex h-4 min-w-[16px] items-center justify-center
                  rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground
                ">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
```

---

## Mobile Testing Checklist

Before any mobile screen is considered complete, verify:

- [ ] All touch targets are >= 44pt (iOS) / 48dp (Android)
- [ ] Primary CTA is in the thumb zone (bottom 25%)
- [ ] No hover-dependent interactions
- [ ] `text-base` on all input fields (prevents iOS zoom)
- [ ] Safe area insets respected (notch, home indicator)
- [ ] Tests pass at 200% font scale
- [ ] `prefers-reduced-motion` respected on all animations
- [ ] Portrait AND landscape work
- [ ] Skeleton screens for all loading states
- [ ] Offline indicator present
- [ ] `inputMode` set correctly on all text fields
- [ ] VoiceOver/TalkBack: logical focus order, all elements labeled
- [ ] Color contrast >= 4.5:1 for text, >= 3:1 for non-text
- [ ] Initial JS bundle < 200KB gzipped
- [ ] LCP < 2.5s on Fast 3G
- [ ] No layout shifts (CLS < 0.1)
- [ ] Hero images use `loading="eager"` + `fetchPriority="high"`
- [ ] Below-fold images use `loading="lazy"`
- [ ] Forms submit without JS (progressive enhancement)
- [ ] No viewport zoom disabled (`user-scalable=no` must not exist)
