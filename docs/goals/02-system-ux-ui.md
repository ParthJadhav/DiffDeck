# Goal 2 — Whole-System UX and UI

Status: complete — verified 2026-07-16

## Objective

Make DiffDeck feel like one quiet, precise review instrument across desktop, narrow screens, light
and dark themes, keyboard and pointer use, read-only and write modes, and every loading, empty,
error, stale, and success state.

This is an information-architecture and interaction-quality goal first. Visual polish follows from
clear hierarchy, predictable state, legible density, and shared component behavior.

## Product Scene

A developer opens DiffDeck from a terminal, often during a focused debugging or implementation
session, and scans a dense set of local changes in normal desk lighting. The interface should load
directly into the work, keep orientation while the developer moves between files and hunks, and
make risky or exceptional actions unmistakable without decorating routine reading.

That scene supports a restrained light/dark system with code as the dominant content. It does not
support a marketing aesthetic, oversized surfaces, ornamental gradients, glass cards, or
attention-seeking motion.

## Research and Current-System Findings

- GitHub, GitLab, and VS Code keep file navigation, diff navigation, viewing preferences, and
  per-file actions close to the review surface and use stable standard affordances.
- The current sidebar is compact and capable, but search, tree, progress, export, filters, settings,
  and reset compete for a small footer area. At narrow widths it consumes a fixed upper region while
  the diff remains the primary task.
- File headers contain the most important local state, but common utilities are missing while
  structural and write actions live behind a generic `details` menu.
- Destructive confirmation is inconsistent: reset/revert use native browser confirmation while
  clearing comments uses an in-product two-step control.
- Global custom scrollbar styling, layered card shadows, and some very small labels/targets should
  be re-evaluated against the product's “quiet through alignment” design principle.
- The app has strong semantic labels in many places, but the complete focus order, tree behavior,
  virtualized remount behavior, dialog isolation, and accessible diff reading need a system pass.

## Workstreams

### U1 — Information architecture and review flow

Map the complete journey—launch, orient, filter, navigate, inspect, comment, mark viewed, refresh,
re-review, export, optionally mutate, and finish—and give each action one predictable home.

Required outcomes:

- a clear hierarchy among global review actions, per-file actions, per-hunk/line actions, and packet
  actions;
- one consistent selected-file model across sidebar, URL, sticky header, focus mode, and viewport;
- visible progress and “what remains” without a dashboard-style metric treatment;
- filters and preferences that show active state and can be reset at the correct scope;
- review notes and packet actions that do not appear/disappear in a way that shifts essential
  controls unexpectedly;
- a clear, deliberate end state when all visible files are viewed;
- no generic “Actions” or ambiguous combined command when precise labels fit.

### U2 — Responsive structure

Treat responsive behavior as an interaction redesign, not just stacked desktop panels.

- Desktop: resizable file navigation with a stable reading surface and sensible persisted size.
- Tablet/narrow laptop: collapsible navigation that does not permanently tax diff height.
- Phone/narrow: a deliberate file-picker/review pattern with fast return to navigation, no trapped
  controls, and no need to horizontally scroll the page itself.
- Split diff must switch to unified before either side becomes unreadable.
- Internal code overflow may scroll when chosen; document-level horizontal overflow is never
  acceptable.
- Dynamic resize and orientation changes must not blank, mismeasure, or desynchronize virtualized
  content.

Test 320×568, 375×812, 600×900, 768×1024, 1024×768, 1280×720, and 1440×900, plus 200% browser zoom.

### U3 — Visual system and components

Document and consolidate the product vocabulary in `DESIGN.md`:

- semantic OKLCH color roles for backgrounds, text, selection, focus, status, diff additions and
  deletions, destructive actions, warnings, success, and disabled state;
- WCAG AA contrast evidence for text and meaningful controls in light and dark themes;
- a compact fixed type scale with readable minimums and tabular/monospace rules;
- spacing, radius, border, elevation, and semantic z-index scales;
- one button, checkbox, toggle, input, popover/dialog, menu, badge, toast, skeleton, and empty-state
  vocabulary;
- component states: default, hover, focus-visible, active, disabled, loading, error, success, and
  selected where relevant.

Remove ornamental or inconsistent styling that does not help state recognition. Do not pair broad
decorative shadows with borders, over-round cards, customize scrollbars without a functional need,
or add decorative motion.

### U4 — Accessibility and input parity

- Maintain logical landmarks, headings, labels, descriptions, and live regions.
- Make the file tree conform to expected tree keyboard behavior; provide flat list mode for users
  who prefer simpler navigation.
- Ensure every pointer-only line, hunk, file, image, comment, and mutation interaction has a
  keyboard path.
- Preserve focus through virtualized unmount/remount, refresh, filtering, mode changes, confirmation,
  and error recovery.
- Make shortcut help truthful, platform-aware, discoverable, and suppressed during text/control
  input.
- Verify 200% zoom, text resizing, reduced motion, forced colors/high contrast where supported, and
  accessible names that include enough file/line context without repeated noise.
- Keep meaningful pointer targets at least WCAG 2.2 AA size or provide sufficient spacing and an
  equivalent larger target.

### U5 — State, copy, and feedback design

Design and test the complete state matrix:

- initial load, slow load, empty diff, invalid Git arguments, Git unavailable, repository removed;
- per-file load, heavy-file fallback, binary/unsupported file, malformed dependency file, conflict;
- watch update, deferred refresh during editing, stale snapshot, stale/resolved comments;
- editor/structural executable unavailable, capability-token failure, network/event-stream failure;
- read-only, staged-only, worktree-only, mixed staged/worktree, and commit/range review;
- mutation idle, preview, confirmation, pending, success, failure, stale rejection, and recovery;
- clipboard, download, terminal submission, and browser permission failure.

Use concise language that says what happened and what the user can do next. Routine success should
be quiet. Destructive confirmation should be in-product, scope-specific, keyboard-safe, and
consistent—native `window.confirm` should not remain.

### U6 — Motion and perceived performance

- Use 150–250 ms motion only to explain state change: panel reveal, selection, confirmation, toast,
  or mode transition.
- Keep content visible by default and provide reduced-motion alternatives.
- Use skeletons or stable reserved space for asynchronous content; do not let controls jump as data
  arrives.
- Preserve responsive scrolling while syntax highlighting, dependency summaries, and comments load.
- Measure before changing virtualization, worker, or chunk boundaries.

## Required Design Process

1. Capture current screenshots and accessibility snapshots for the state/breakpoint matrix.
2. Produce a brief flow and hierarchy audit with P0–P3 findings before editing.
3. Write the intended component/state vocabulary in `DESIGN.md`.
4. Implement by system layer—tokens/primitives, shell/navigation, file surface, comments/actions,
   states—while keeping each layer releasable.
5. Compare before/after screenshots and repeat the heuristic/accessibility review.
6. Feed every behavioral defect discovered during polish into Goal 3 with a regression test.

## Acceptance Evidence

- `DESIGN.md` documents the actual shipped tokens, components, layout rules, state language, and
  motion rules.
- Visual regression coverage exists for representative desktop and narrow states in light and dark
  themes, including empty, error, comment, image, dependency, and write-enabled views.
- Automated accessibility checks report no serious/critical issues, followed by keyboard and
  accessibility-tree inspection of custom/virtualized controls.
- Contrast calculations are recorded for all text and status/diff colors.
- Every matrix state has a screenshot or focused test assertion and usable recovery path.
- Dynamic resize/orientation tests reproduce and close the responsive blank-pane seed.
- No page-level horizontal overflow exists at the required widths or 200% zoom.
- No focus trap, invisible focus, hover-only action, misleading label, unexpected layout shift, or
  decorative animation remains.
- Console, network, performance, and bundle checks show no unexplained regression.

## Done Condition

This goal is done only when the complete shipped interface—not just newly edited components—uses
one documented design and interaction system; the full responsive, theme, accessibility, state,
and input matrix passes; before/after evidence demonstrates clearer hierarchy and review flow; and
every defect discovered during the pass is fixed and regression-tested or moved into the active bug
bash without being marked complete here.

## Completion evidence

- `DESIGN.md` is the shipped vocabulary for hierarchy, layout, OKLCH/contrast roles, typography,
  component states, feedback, motion, and performance.
- The before-pass findings and final hierarchy are recorded in
  `docs/research/ux-flow-audit-2026-07-16.md`.
- Seven committed baselines cover desktop/narrow, light/dark, write, note, dependency, image,
  accessible, empty, and fatal-error states.
- Dynamic widths 1440 through 320, 200% equivalent zoom, reduced motion, forced colors, keyboard
  paths, modal isolation, and Axe all pass.
- The full product/failure matrix is in `docs/RELEASE_VERIFICATION_2026-07-16.md`; every UX finding
  is closed in the bug-bash log.
