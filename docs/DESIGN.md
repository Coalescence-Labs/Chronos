# Design — Chronos

> The UI is a feature. Chronos should feel highly polished and perfected — calm, powerful, intentional. "Works" is not "done"; **done includes polish.**

## Design language

**Organic-futuristic-modernism.** Dimensional dark themes, glass/gradient surfaces, subtle depth, physics-informed motion. Alive, never noisy. Typography clean and confident (Satoshi or similar).

The aesthetic serves the product north star: **understanding per glance**. Beauty here is not decoration — a calm, legible surface *is* lower cognitive load.

## The core view: the branch graph

This is the product. Get it right and everything else follows.

- **Lanes read instantly.** Branch lanes, merges, and divergences should be parseable without a legend. Color and position carry meaning consistently.
- **Progressive depth.** Glanceable by default; detail on hover (laptop) / tap (phone). Never dump everything at once.
- **Meaningful motion.** Animate to explain change (a branch appearing, a merge resolving), not to entertain. Respect `prefers-reduced-motion`.
- **No knob soup.** Every control must earn its place by reducing confusion. If a feature needs a settings panel to be understood, redesign the feature.

## Responsive: phone-equal

The phone experience is **first-class**, not a shrunk desktop.

- Design the graph interaction for **touch first** (pan, pinch-zoom, tap-to-inspect), then enhance for pointer + keyboard.
- Inspection panels become sheets/drawers on phone, side panels on laptop.
- Test real layouts at narrow widths early — the graph must stay legible on a 390px-wide screen.
- Ship as an installable **PWA** so phone users get an app-like surface with no app store.

## Polish bar (a feature isn't done until)

- Loading, empty, and error states are designed — not default spinners and raw error text.
- Transitions are smooth (target 60fps; offload heavy layout work off the main thread).
- Touch targets ≥ 44px; nothing important hidden behind hover-only on touch devices.
- Dark theme is the default and is genuinely dimensional, not flat gray.
- Accessibility: real focus states, keyboard navigation, sufficient contrast, `prefers-reduced-motion` honored, meaningful color paired with non-color cues (don't rely on color alone to convey branch relationships).

## Accessibility & color

Color is a primary signal in a graph, so it carries extra responsibility: pair it with shape/position/labels, ensure contrast, and verify the graph is still readable for color-vision deficiencies. This intersects with render-tech choice (see [ARCHITECTURE.md](ARCHITECTURE.md) open decision #2) — keep accessibility in the decision.

## What to avoid

- Visual noise that competes with the graph.
- Animation for its own sake.
- Feature creep that adds knobs instead of clarity.
- A mobile experience that feels like an afterthought.
