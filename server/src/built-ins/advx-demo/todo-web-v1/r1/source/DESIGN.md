# Remember Todo Design System

## 0. Research Log

- Embedded refs: shortlisted Linear, Notion, Things; picked minimalist discipline plus Linear's precise productivity grammar.
- Lazyweb: skipped because this is a bounded contract fixture, not a production design commission.
- Imagen drafts: skipped because the challenge requires a dependency-free native app and no raster assets.

## 1. Atmosphere & Identity

Remember Todo is a quiet daily desk: warm paper, crisp ink, and one restrained amber accent. Its signature is the progress rail, which turns completion into a calm, immediately legible rhythm without gamification.

## 2. Color

The CSS owns a small token palette: canvas, paper, ink, muted ink, hairline, amber accent, success, and danger. Accent is reserved for focus, primary action, and current filter state; danger appears only on destructive actions.

## 3. Typography

The app uses a local system sans stack to avoid network dependencies. Display text uses the same family with tighter tracking; metadata uses the local monospace stack. The scale is 12, 14, 16, 20, and a responsive 36-52 pixel display.

## 4. Spacing & Layout

All declared spacing tokens derive from a 4 pixel base. The centered shell is capped at 760 pixels, uses a single reading column, and collapses its composer and toolbar to one column below 640 pixels.

## 5. Components

### Composer
- Structure: labelled text input, validation message, primary submit button.
- States: empty, focus, invalid, submitted.
- Accessibility: visible label, described error, keyboard submit, focus restoration.

### Filter Rail
- Structure: three native buttons with pressed state and live counts.
- States: all, active, completed, focus, hover.
- Accessibility: `aria-pressed` exposes selection without color reliance.

### Todo Row
- Structure: native checkbox, editable task label, edit button, delete button.
- States: active, completed, editing, focus, removing.
- Accessibility: generated labels, native controls, no icon-only ambiguity.

### Status Notice
- Structure: polite live region for saves and undo action for destructive changes.
- States: idle, success, error, undo available.
- Accessibility: text feedback remains available to assistive technology.

## 6. Motion & Interaction

Micro motion is limited to opacity and transform over 160 milliseconds. Completion and insertion communicate state change; `prefers-reduced-motion` removes transitions and animations.

## 7. Depth & Surface

The strategy is borders plus one restrained panel shadow. Surface hierarchy comes from warm tonal shifts; no gradients, glass, or ornamental effects are used.

## 8. Accessibility Constraints & Accepted Debt

Target WCAG 2.2 AA with visible focus, native keyboard controls, 44 pixel touch targets, labelled forms, live feedback, and reduced-motion support.

Accepted debt: this static challenge fixture has no browser automation or measured contrast report. Runtime accessibility, rendering, and performance remain inference until separately exercised.
