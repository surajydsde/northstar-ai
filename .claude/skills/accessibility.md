---
name: accessibility
description: WCAG 2.2 AA checklist, keyboard navigation, focus management, ARIA, screen reader compatibility, and color contrast standards for Northstar AI UI changes.
---

# Accessibility Skill

## WCAG 2.2 Level AA — Full checklist

### Perceivable

#### 1.1 — Text alternatives
- [ ] All `<img>` elements have `alt` text that describes the image.
- [ ] Decorative images use `alt=""`.
- [ ] Icon-only buttons have `aria-label` or a visually hidden text label.
- [ ] SVG icons used as images have `role="img"` and `aria-label`.
- [ ] Charts and complex visuals have a text alternative or summary.

#### 1.3 — Adaptable
- [ ] Information, structure, and relationships are programmatically
  determinable (semantic HTML, not visual-only layout).
- [ ] Reading sequence is logical when CSS is disabled.
- [ ] No UI component relies solely on sensory characteristics (shape, color,
  size, visual location, orientation, sound).
- [ ] Screen orientation is not restricted to landscape or portrait.
- [ ] Input purpose is identified (`autocomplete` attributes on personal data
  fields: `name`, `email`, `current-password`, etc.).

#### 1.4 — Distinguishable
- [ ] Color is not the only means of conveying information (error states have
  both color AND an icon or text).
- [ ] Audio that plays automatically for more than 3 seconds can be stopped.
- [ ] Normal text: contrast ratio ≥ 4.5:1.
- [ ] Large text (≥ 18pt / 14pt bold): contrast ratio ≥ 3:1.
- [ ] UI components and focus indicators: contrast ratio ≥ 3:1 against adjacent
  colors.
- [ ] Text can be resized up to 200% without loss of content or functionality.
- [ ] Images of text are not used (except logos).
- [ ] Reflow: content is viewable at 320px width without horizontal scrolling
  (except for content requiring two-dimensional layout, like maps).
- [ ] Text spacing can be adjusted without loss of functionality (line height
  1.5×, paragraph spacing 2×, letter spacing 0.12em, word spacing 0.16em).
- [ ] Hover or focus content (tooltips, dropdowns) can be dismissed, hovered,
  and persisted (WCAG 2.2 1.4.13).

### Operable

#### 2.1 — Keyboard accessible
- [ ] All functionality is available via keyboard.
- [ ] No keyboard trap (focus can always leave with Tab or Esc).
- [ ] Keyboard shortcuts (if any) can be turned off or remapped.

#### 2.2 — Enough time
- [ ] Time limits can be turned off, adjusted, or extended (if applicable).

#### 2.4 — Navigable
- [ ] Bypass blocks mechanism present (skip navigation link, landmark regions).
- [ ] Page has a descriptive `<title>` matching page purpose.
- [ ] Focus order follows logical, meaningful sequence.
- [ ] Link and button text is descriptive (not "click here", "more").
- [ ] Multiple ways to navigate exist (nav menu, search, site map).
- [ ] Headings and labels are descriptive.
- [ ] Focus is visible (WCAG 2.2 enhanced: focus indicator has area ≥ perimeter
  of component, contrast ≥ 3:1).

#### 2.5 — Input modalities (WCAG 2.1+)
- [ ] Pointer gestures (swipe, pinch) have a single-pointer alternative.
- [ ] Pointer cancellation: down-events do not trigger actions (use `click`).
- [ ] Labels match the accessible name of controls.
- [ ] Motion actuation has a UI alternative and can be disabled.
- [ ] Dragging movements have a single-pointer alternative (WCAG 2.2).
- [ ] Target size ≥ 24×24 CSS pixels (WCAG 2.2 minimum), ideally ≥ 44×44.

### Understandable

#### 3.1 — Readable
- [ ] `<html lang="en">` present.
- [ ] Language of phrases in other languages is identified (`lang` attribute).

#### 3.2 — Predictable
- [ ] No context change on focus.
- [ ] No context change on input (unless the user is informed beforehand).
- [ ] Navigation is consistent across pages.
- [ ] Components with the same function are identified consistently.

#### 3.3 — Input assistance
- [ ] Error messages identify the field in error and describe what to fix.
- [ ] Labels and instructions are provided before or adjacent to inputs.
- [ ] Error suggestions are provided when known.
- [ ] For legal/financial/data-deletion submissions: confirmation step or
  ability to review and correct before final submission.

### Robust

#### 4.1 — Compatible
- [ ] HTML is valid (no duplicate IDs, properly nested elements).
- [ ] Name, role, and value are programmatically determinable for all UI
  components.
- [ ] Status messages can be programmatically determined via role or property
  (`role="alert"`, `aria-live`, `role="status"`).

---

## Keyboard navigation checklist

| Element | Tab | Enter | Space | Arrow keys | Esc |
|---|---|---|---|---|---|
| Button | ✓ focusable | ✓ activates | ✓ activates | — | — |
| Link | ✓ focusable | ✓ follows | — | — | — |
| Text input | ✓ focusable | — | — | cursor movement | — |
| Select/dropdown | ✓ focusable | — | ✓ opens | ✓ selects option | ✓ closes |
| Checkbox | ✓ focusable | — | ✓ toggles | — | — |
| Modal/dialog | focus moves in | — | — | — | ✓ closes |
| Menu | ✓ first item | ✓ selects | — | ✓ moves between items | ✓ closes |
| Accordion | ✓ focusable | ✓ toggles | ✓ toggles | — | — |
| Tab panel | ✓ active tab | — | — | ✓ moves between tabs | — |

---

## ARIA quick reference

### When to use ARIA

Use ARIA only when HTML semantics are insufficient. Prefer semantic HTML:
- `<button>` over `<div role="button">`
- `<nav>` over `<div role="navigation">`
- `<header>` over `<div role="banner">`

### Common patterns

```tsx
// Landmark regions
<header role="banner">
<nav aria-label="Primary navigation">
<main>
<aside aria-label="Related content">
<footer role="contentinfo">

// Live regions for dynamic content
<div aria-live="polite" aria-label="Chat messages">
  {/* new messages announced to screen reader */}
</div>
<div role="alert">
  {/* errors announced immediately */}
</div>
<div role="status">
  {/* status updates announced politely */}
</div>

// Expandable elements
<button
  aria-expanded={isOpen}
  aria-controls="menu-id"
  onClick={toggle}
>
  Menu
</button>
<ul id="menu-id" hidden={!isOpen}>
  ...
</ul>

// Loading states
<button aria-busy={isLoading} disabled={isLoading}>
  {isLoading ? 'Sending...' : 'Send'}
</button>

// Required fields
<input
  id="email"
  type="email"
  aria-required="true"
  aria-describedby="email-error"
/>
<span id="email-error" role="alert">
  {errors.email}
</span>
```

---

## Screen reader compatibility

- Test with NVDA + Chrome (Windows) or VoiceOver + Safari (macOS).
- All content must be readable in screen reader order.
- Dynamic updates (new chat messages, notifications) must be announced.
- Modal focus management: trap focus inside while open, return to trigger on close.

---

## Color contrast reference (Tailwind)

Common Tailwind classes and their contrast against white (`#ffffff`):

| Foreground class | Color | Contrast vs white | WCAG normal |
|---|---|---|---|
| `text-gray-900` | #111827 | 16.1:1 | PASS |
| `text-gray-700` | #374151 | 10.7:1 | PASS |
| `text-gray-500` | #6B7280 | 4.6:1 | PASS |
| `text-gray-400` | #9CA3AF | 2.8:1 | FAIL |
| `text-blue-600` | #2563EB | 5.9:1 | PASS |

Use a contrast checker tool for custom colors. Never rely on a color alone to
convey information (always pair with an icon, text, or pattern).
