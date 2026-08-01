# Remember Todo

A dependency-free, single-page Todo application built with native HTML, CSS, and JavaScript.

## Run

Open `index.html` directly in a modern browser. No install, build step, remote API, or server is required.

## Features

- Add, edit, complete, delete, and filter tasks.
- Persist validated task data and the selected filter in `localStorage`.
- Recover safely from malformed or unavailable storage.
- Undo the most recent deletion or completed-task cleanup.
- Show empty, validation, storage-error, and save-feedback states.
- Support keyboard operation, reduced motion, and narrow phone layouts.

## Error boundary

Storage is the only fallible external boundary. Reads parse and validate every record before use; failures fall back to an empty in-memory list. Writes are wrapped so the app remains usable and shows a persistent warning if storage is blocked or full.

## Manual acceptance path

1. Add two tasks, including one with surrounding whitespace.
2. Edit one task, complete the other, and switch all three filters.
3. Reload and confirm tasks and the selected filter remain.
4. Delete a task, undo the deletion, then clear completed tasks.
5. Try a blank task and verify focus, inline error text, and live feedback.
6. Resize to 375 pixels and operate every control with keyboard only.

## Files

- `index.html`: semantic single-page shell and accessible controls.
- `styles.css`: tokenized responsive presentation and state styling.
- `app.js`: state transitions, persistence, rendering, and recovery.
- `DESIGN.md`: explicit visual, interaction, and accessibility contract.
