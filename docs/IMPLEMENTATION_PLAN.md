# DiffDeck Complete Improvement Plan

## Objective

Evolve DiffDeck from a polished local diff viewer into a durable, keyboard-first review loop
between a developer and a coding agent, while preserving its local, quiet, terminal-adjacent
product identity.

This document is the implementation contract for the active goal. A requirement is complete only
when its acceptance criteria are implemented and verified by the evidence named below.

## Product Guardrails

- Keep the default experience read-only, local, private, and fast.
- Do not turn DiffDeck into a hosted collaboration product or a generic Git GUI.
- Gate every repository mutation behind explicit `--write` authorization and confirmation.
- Keep optional integrations capability-detected and functional when their external executable is
  absent.
- Preserve WCAG AA contrast, visible focus, reduced motion, and mobile usability.
- Preserve the existing user-owned worktree changes for review progress, selected-file styling,
  unsupported-file icons, and dark-theme token refinements.

## Architectural Seams

### ReviewSession module

The ReviewSession module owns all browser-side review behavior behind one interface:

- selected and visible file
- viewed and collapsed file state
- comment drafts and saved annotations
- comment status across refreshes (`open`, `resolved`, `stale`)
- persistence and schema migration
- reconciliation against a refreshed diff snapshot
- Markdown and JSON review-packet generation

Its production adapter uses browser storage. Its test adapter is in-memory. React consumes the same
interface that tests exercise.

### DiffSource module

The DiffSource module owns repository reading and optional mutations behind one interface:

- list and summarize changed files
- lazily load one text diff
- load old/new binary or image content
- produce dependency and optional structural summaries
- refresh the snapshot
- stage, unstage, or revert an explicitly selected file/hunk when write mode is enabled

The production adapter uses Git and the filesystem. Tests use disposable repositories. Server
routes must not reach into raw maps or raw patch storage directly.

### ReviewPacket module

The ReviewPacket module is pure and in-process. It normalizes diff lines, creates stable anchors,
and renders the same canonical packet as Markdown, JSON, clipboard text, a downloaded file, or a
terminal submission.

## Requirements

### R1 — Durable review sessions

- Persist viewed files, collapsed files, selection, drafts, saved comments, and filter state.
- Key storage by repository identity plus normalized diff arguments.
- Include a versioned persistence schema and safe migration/fallback behavior.
- Preserve state through page reload and manual diff refresh.
- Clear or archive state explicitly; never silently discard it.

Acceptance evidence:

- Unit tests for serialization, migration, and corrupted storage.
- Chrome test: create progress and a draft, reload, and verify restoration.
- Chrome test: refresh the Git diff and verify unaffected files retain review state.

### R2 — Re-review reconciliation

- Give comments stable anchors containing file path, side, line, nearby normalized content, and
  snapshot identity.
- On refresh, mark anchors as open, resolved, or stale.
- Invalidate viewed state only for files whose diff identity changed.
- Show a concise re-review summary and allow stale comments to be re-anchored or deleted.

Acceptance evidence:

- Unit tests for unchanged, shifted, resolved, renamed, deleted, and ambiguous anchors.
- Chrome test using the disposable fake repository and a live refresh.

### R3 — Canonical agent review packet

- Remove duplicate blank lines from exported context.
- Export both human-readable Markdown and versioned JSON.
- Include repository/diff identity, Git arguments, ordered comments, ranges, normalized context,
  statuses, and review progress.
- Support clipboard copy, file download, and “Send to terminal.”
- Print terminal submissions as a clearly delimited payload without vendor-specific coupling.

Acceptance evidence:

- Snapshot tests for Markdown and JSON.
- Server integration test for terminal submission.
- Chrome clipboard and download tests.

### R4 — Keyboard-first and accessible review

- Add `j`/`k` file navigation, `v` viewed toggle, `c` comment, `x` collapse, `/` search, `s`
  settings, `o` editor open, and `?` shortcut help.
- Add a command palette using `cmdk`.
- Make line selection/comment targets keyboard focusable with descriptive accessible names.
- Give the file tree, main review region, resize separator, and hunk expansion controls useful
  accessible names.
- Preserve focus across virtualization, refresh, dialogs, and command execution.
- Respect text inputs and never fire global shortcuts while the user is typing.

Acceptance evidence:

- Unit tests for shortcut routing and input suppression.
- Chrome keyboard-only walkthrough and accessibility-tree inspection.
- Chrome checks at desktop and 600-pixel widths with reduced motion.

### R5 — Review triage and navigation

- Filter by path, extension, status, viewed/unviewed, conflict, binary/image, dependency file, and
  change-size class.
- Hide viewed, deleted, generated, or lock files without losing state.
- Show active filters, result count, and a one-action reset.
- Add URL deep links for selected file and line.
- Add editor-open actions with configurable `--editor` behavior.

Acceptance evidence:

- Unit tests for composable filter semantics and URL state.
- Chrome tests for filters, deep-link reload, and editor action error handling.

### R6 — Image rich diffs

- Serve old/new image content without exposing arbitrary repository paths.
- Render added, deleted, and modified images.
- Provide side-by-side, overlay, and swipe comparison modes where both sides exist.
- Show dimensions, encoded size, MIME type, and missing-side states.
- Preserve the generic binary placeholder for unsupported formats.

Acceptance evidence:

- Server tests for allowed paths, MIME detection, missing sides, and authorization.
- Chrome visual/interaction tests for added, modified, and deleted fixtures.

### R7 — Dependency rich diffs

- Detect supported manifest and lockfile formats.
- Summarize added, removed, upgraded, and downgraded packages.
- Show old/new versions and retain a source-diff toggle.
- Fall back safely for unsupported or malformed dependency files.

Initial supported formats:

- `package.json`
- `bun.lock` / `bun.lockb` where readable
- `yarn.lock`
- `package-lock.json`
- `pnpm-lock.yaml`

Acceptance evidence:

- Parser fixtures and malformed-input tests.
- Chrome test against the existing large `yarn.lock` fixture.

### R8 — Performance and failure isolation

- Do not fetch auto-collapsed heavy files until the user expands them.
- Add cancellation for obsolete file requests.
- Display per-file load errors with retry without replacing the whole app.
- Move expensive per-file parsing behind lazy DiffSource loading where practical.
- Avoid rebuilding the same initial session twice.
- Add intentional client chunking and remove the current oversized-entry warning or document a
  measured exception.

Acceptance evidence:

- Tests for queue cancellation, retry, and stale generations.
- Chrome network inspection proving collapsed heavy files remain unloaded.
- Production build with recorded bundle sizes and no unexplained chunk warning.

### R9 — Watch mode and notifications

- Add `--watch` and configurable debounce/poll interval.
- Detect relevant worktree/index changes and notify the browser through a local event stream.
- Offer auto-refresh or manual refresh without interrupting an active comment edit.
- Use Sonner for visible, accessible notifications.

Acceptance evidence:

- Watcher tests using a disposable repository.
- Chrome test that edits a fixture and receives/reconciles the update.

### R10 — Safe remote-host mode

- When bound beyond loopback, generate a cryptographically random capability token.
- Require the token for JSON, event-stream, blob, terminal, editor, structural, and write routes.
- Print and open the complete tokenized URL.
- Warn clearly that repository content is being exposed to the selected interface.
- Avoid returning absolute repository paths unless needed by an explicitly authorized action.

Acceptance evidence:

- Server tests for missing, invalid, and valid tokens.
- CLI tests for loopback versus non-loopback URL behavior.

### R11 — Optional write mode

- Add `--write`; mutation controls are absent without it.
- Support stage/unstage/revert for a file and an individual hunk.
- Preview the exact action and require confirmation for revert.
- Reject stale snapshot mutations and refresh after success.
- Never allow arbitrary paths or arbitrary Git argument injection.

Acceptance evidence:

- Disposable-repository tests for file/hunk stage, unstage, revert, stale snapshot, and denied mode.
- Chrome tests for control visibility, confirmation, success, and failure states.

### R12 — Optional structural diff

- Capability-detect `difft`/Difftastic.
- Add an opt-in per-file structural view for supported text files.
- Render a stable no-tool/unavailable state and retain source diff as the default.
- Bound execution time and output size.

Acceptance evidence:

- Adapter tests with fake executable success, timeout, malformed output, and missing executable.
- Chrome test for availability and fallback states.

### R13 — CLI correctness and documentation

- Reject summary-only Git modes that cannot produce a renderable patch.
- Validate ports through 65535 and distinguish an explicitly supplied default port from an implicit
  default.
- Produce valid URLs for IPv6 hosts.
- Document every new flag, security behavior, keyboard shortcut, mutation safeguard, and optional
  executable.

Acceptance evidence:

- CLI parser and startup tests.
- README examples verified against the built CLI.

### R14 — Automated quality coverage

- Add `bun test` to the required `check` pipeline and both GitHub workflows.
- Cover ReviewSession, ReviewPacket, DiffSource, filters, dependency parsing, watcher, security,
  mutations, structural adapter, CLI, and server routes.
- Add browser-facing regression coverage for the critical review flow where maintainable.
- Keep every test at a real module interface; avoid tests coupled to implementation details.

Acceptance evidence:

- `bun test` passes.
- `bun run check` passes and includes tests.
- Coverage includes client modules and every new server module; uncovered critical branches are
  documented and resolved before completion.

## Delivery Phases

### Phase 1 — Foundations and correctness

- R1 durable ReviewSession
- R3 ReviewPacket and export correctness
- R8 per-file errors, cancellation, and collapsed-heavy-file loading
- R10 remote-host capability token
- R13 CLI correctness
- R14 test/CI wiring

### Phase 2 — Review workflow

- R2 re-review reconciliation
- R4 keyboard/accessibility and `cmdk`
- R5 filters, deep links, and editor integration
- R9 watch mode and Sonner notifications

### Phase 3 — Rich review modes

- R6 image rich diffs
- R7 dependency rich diffs
- R12 structural diff adapter

### Phase 4 — Authorized mutations

- R11 file and hunk stage/unstage/revert

### Phase 5 — Chrome verification and bug bash

- Run the complete acceptance matrix below in the user-requested Chrome browser.
- Record every discovered defect in the Bug Bash Log section.
- Fix each defect, add an appropriate regression test, and rerun affected scenarios.
- Repeat until the bug bash has no open defects.

## Chrome Acceptance Matrix

Test each applicable scenario in light, dark, and system themes; desktop and 600-pixel layouts; and
with reduced motion enabled.

1. First launch, empty diff, loading, refresh, and server error states.
2. File-tree search, all filters, selected-file synchronization, and URL deep links.
3. Keyboard-only navigation, line comment creation/edit/delete, dialogs, and command palette.
4. Viewed/collapsed/comments/drafts persistence through reload and refresh.
5. Re-review behavior after unchanged, shifted, removed, and renamed changes.
6. Markdown/JSON clipboard, download, and terminal review-packet outputs.
7. Added/modified/deleted image comparison modes.
8. Dependency summary and source fallback for valid and malformed fixtures.
9. Heavy-file collapse/expand network behavior and scrolling performance.
10. Watch notification, deferred refresh during editing, and reconciliation.
11. Editor-open success and unavailable-editor failure.
12. Token-gated remote mode.
13. Read-only mode and authorized file/hunk stage, unstage, and revert.
14. Structural-diff available, missing, timeout, and fallback behavior.
15. Accessibility tree names, focus order, visible focus, live regions, and no keyboard traps.
16. Console errors, failed network requests, layout overflow, and stale UI after every flow.

## Bug Bash Log

| ID | Scenario | Defect | Severity | Regression test | Status |
| --- | --- | --- | --- | --- | --- |
| BB-01 | Keyboard file navigation | Deep-link hydration and live URL sync could oscillate until React hit its maximum update depth. | P0 | Chrome `j`/`k` navigation plus reload; one-shot identity hydration | Closed |
| BB-02 | Reloaded deep link | Tree selection ran before reset paths existed, leaving the selected diff and tree out of sync. | P1 | Chrome deep-link reload; `useLayoutEffect` ordering | Closed |
| BB-03 | Immediate draft reload | Draft text reached ReviewSession only on blur and could lose the last edit on reload. | P0 | Chrome type-and-immediate-reload; ReviewSession serialization | Closed |
| BB-04 | Auto-collapsed heavy file | Lazy loading skipped the file correctly, but the unloaded row had no header and therefore could not be expanded. | P0 | Chrome CDP request audit and expand/retry flow | Closed |
| BB-05 | Dependency summary | The summary replaced the source component's file header, hiding viewed/collapse/write/structural actions. | P1 | Chrome large `yarn.lock` summary/header check | Closed |
| BB-06 | Deep link to virtualized tail | Scroll deduplication keyed only on a numeric signal, so a path-only hydration could fail to mount the target row. | P1 | Chrome `?file=yarn.lock` tail navigation | Closed |
| BB-07 | JSON packet download | Blob/data-URL clicks were not observable as native Chrome downloads. | P1 | Server attachment integration test and Chrome download event | Closed |
| BB-08 | Shortcuts inside the shadow-DOM tree | The tree consumed `j`/`k` as search text before the global shortcut router received them. | P1 | Chrome tree-focus keyboard walkthrough; capture/composed-path routing | Closed |
| BB-09 | Re-anchored annotation display | Export anchors moved after refresh but the rendered annotation retained its old line. | P1 | `reconcileAnnotationsToComments` unit assertion | Closed |

## Completed Verification Record

- `bun run check`: passing; includes typecheck, lint, format check, 28 tests, client build, and
  server build.
- `bun run pack:dry-run`: passing; package contents and executable build verified.
- Production entry chunk: approximately 208 kB minified. The only chunks above 500 kB are
  independently loaded Shiki grammars; the measured exception is documented in `vite.config.ts`.
- Chrome desktop: keyboard navigation, filters, deep links, selected-file sync, comment
  create/edit/save, immediate draft reload, viewed persistence, Markdown clipboard, JSON download,
  terminal packet, image modes/states, dependency summary, heavy-file lazy network behavior,
  per-file retry, watch notification, editor success/failure, structural fallback, read-only and
  write-mode controls, hunk stage/unstage, revert confirmation, and remote token denial/success.
- Chrome responsive/accessibility: 600×900 layout, system/light/dark themes, reduced motion, named
  landmarks and separator, accessible hunk expansion controls, no document-level horizontal
  overflow, and no final console warnings/errors.
- Chrome rich fixtures: modified and deleted images in the working diff; added image in the staged
  diff; valid 3,000-package `yarn.lock` summary.

## Definition of Done

The goal is complete only when:

- R1–R14 acceptance evidence is present and passing.
- The full Chrome Acceptance Matrix has been executed in Chrome.
- Every Bug Bash Log entry is fixed, regression-tested, and marked closed.
- `bun test`, `bun run check`, and production packaging pass.
- No unexpected browser console errors, failed requests, accessibility blockers, or horizontal page
  overflow remain.
- Documentation matches the built CLI and UI.
- Existing user-owned changes are preserved or intentionally incorporated without loss.
