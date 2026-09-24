# Changelog

All notable changes to DiffDeck. Versions follow [Semantic Versioning](https://semver.org/).

## [0.8.0] — 2026-09-24

The sidebar is redesigned from the ground up around the daily review loop: orient, walk the files,
tick them off, collect notes, hand off to the agent.

### Changed

- **Header states the diff and progress.** Repository name, the exact `git diff` command with a
  plain-language scope (`unstaged changes`, `staged changes`, `all uncommitted changes`), `n of N
  files viewed` with a progress bar that turns green when done, and total `+/−`. Progress now counts
  every file in the diff, so `Hide viewed` no longer resets it to zero.
- **One file list for tree and flat modes**, replacing the embedded `@pierre/trees` tree and the
  separate flat list. Every row shows the Git status letter, `+/−`, note count, and a viewed ring
  that marks the file viewed in place. Folders show `viewed/total` and a check when complete;
  single-child folder chains are compressed. Viewed files dim. Both modes stay virtualized (23,000
  files tested).
- **One search field** in both modes, focused with `/` (previously `/` opened the filter popover).
  Search narrows only the list; `Enter` opens the first match, `↓` moves into the list, `Esc`
  clears. Filters are a single icon button, and review order moved into the filter popover.
  Active filters are stated under the toolbar with a one-click Clear.
- **Files and Notes are tabs.** The notes queue gets the full sidebar height, grouped by file, with
  a status filter, the re-review summary, packet preview, and Clear all. The Notes tab flags stale
  notes with a warning dot.
- **The footer is the handoff.** Review navigator, then (once notes exist) Copy for agent, download
  JSON, and send to terminal in one row. Reset review moved into Diff settings; refresh,
  accessible view, and settings are header icons.
- Keyboard: the file list is one Tab stop with arrow keys, Home/End, and Left/Right to fold
  folders; tabs switch with Left/Right. The current file is revealed on load, on `j`/`k`, and while
  scrolling the patch, including inside collapsed folders.
- Settings and filter popovers open downward from top-anchored triggers.
- Copy labels say "notes" throughout: `Copy N notes for agent`, `Clear N notes`.

### Fixed

- `/` moves focus into file search synchronously inside the keydown, so a key typed in the same
  frame (or while the patch is busy re-rendering) is text, never a shortcut. Covered by an e2e spec
  that types with no delay from the Notes tab.
- The merge-conflict e2e spec waits for the rich card's unresolved-file refetch before teardown
  instead of aborting it mid-flight.
- E2E specs no longer flake on slow CI runners: the gutter comment gesture retries through
  Pierre's settle-time re-renders (`openLineComposer`), and the file-note spec no longer
  force-clicks a header that is being swapped. `E2E_CPU_THROTTLE=6` reproduces a slow runner
  locally in Chromium.

### Upgrade notes

- `/` now focuses the file search. Open review filters with the filter button next to it (or the
  command palette).
- Reset review lives at the bottom of Diff settings (`s`).

## [0.7.0] — 2026-08-28

Typing always wins over shortcuts. This release fixes the composer focus loss that turned review
notes into stray commands, gives every text field one keyboard policy, and adds explicit ways to
finish or leave a comment box from the keyboard.

### Fixed

- Typing into a line comment no longer fires shortcuts. Opening a composer from the gutter button,
  a line drag, `c` after hunk navigation, or on a deep-linked line re-rendered the diff, and the
  deep-link landing pulled focus from the new textarea onto the diff line. Every following letter
  became a global shortcut (`s` opened settings, `j` changed files, `a` switched surfaces) and the
  text was lost. Landing on a line now happens once per location and never steals focus from a text
  field.
- Single-key shortcuts stay quiet while a modal dialog is open and while focus is inside a popover,
  menu, or the command palette. Previously `j`/`k` changed the file behind the reset and revert
  confirmations.
- Holding a key no longer flips `v`, `x`, `f`, or `a` back and forth or reopens panels; auto-repeat
  only steps through files and hunks.
- IME composition keystrokes (`isComposing`, legacy keyCode 229) are never shortcuts.
- The review-note editor and file-level note place the caret at the end of existing text instead of
  the start.
- Scroll-intent keys typed in text fields inside shadow roots (the file search, comment boxes) no
  longer release the pinned file selection.
- Watch-mode auto refresh now waits while any text field has focus, not only the line composer.

### Added

- `Cmd/Ctrl+Enter` submits every composer: line comment, comment edit, file-level note, review-note
  edit, and accessible-patch note. `Esc` leaves a composer with the draft intact and returns focus
  to the note so shortcuts resume. Each composer shows the hint.
- Submitting or cancelling a note keeps focus on the note instead of dropping it on the page body.
- `src/client/lib/keyboard.ts`: the single keyboard policy (text entry wins, overlays own the
  keyboard, composition and repeat guards) shared by the shortcut layer, the accessible patch, and
  the file scroller.
- `e2e/keyboard.e2e.ts`: eleven Chromium specs that type character by character into every text
  surface and assert nothing else moves.

### Changed

- README documents the keyboard ownership rules alongside the shortcut table; `DESIGN.md` records
  them as a design rule.

## [0.6.2] — 2026-08-09

### Fixed

- Ordering 23,000 files by size or status no longer degrades to quadratic time.

## [0.6.1] — 2026-07-24

### Fixed

- Global shortcuts always act on the current selection and navigation state.
- Scroll-intent keys release the pinned file selection; other keys leave it alone.

## [0.6.0] — 2026-07-22

Completes the re-review workflow, repairs review-note reconciliation and rename staging, and backs
every user-facing flow with an end-to-end Playwright suite.

### Added

- Re-review summary in the sidebar after a repository change, with one-click **Delete stale** and
  **Clear resolved** actions for reconciled notes.
- `e2e/flows.e2e.ts`: 13 Chromium specs covering the command palette, every global keyboard
  shortcut, the viewed lifecycle, review filters, comment lifecycle and packet actions (clipboard,
  JSON download, terminal), deep links, image comparison modes, dependency summaries, binary and
  unusual paths, diff settings, auto-collapse, the heavy-diff fallback, and editor handoff.
- `e2e/mutations.e2e.ts` and a server harness that launches a real `diffdeck` process per test on a
  disposable repository: staging, hunk-scoped staging, whole-file revert, watch events with manual
  and auto refresh, stale/resolved note reconciliation, terminal packet delivery, cached-mode
  rename unstaging, and merge-conflict rendering.

### Changed

- `/` now opens the review filters panel and focuses the path filter even when the panel is closed.
  Previously the shortcut only worked while the panel was already open.
- CI uploads Playwright traces and reports when the suite fails.

### Fixed

- Review notes reconcile against the new snapshot's diffs after a refresh. They were re-anchored
  against the outgoing snapshot's cached diffs, which silently reverted every note to "open".
- Unstaging a renamed file restores both index entries; the old path's staged deletion was left
  dangling.
- Write actions no longer trigger 404 diff requests (and a transient error card) for files the
  action just removed from the diff.
- The "send packet to terminal" request consumes its response body, so browsers no longer report
  the completed request as aborted during later navigation.

## [0.5.2] — 2026-07-21

### Fixed

- Restored the rich diff comment button.

## [0.5.1] — 2026-07-20

### Fixed

- Parser placeholder paths no longer leak into the diff view.

## [0.5.0] — 2026-07-18

The largest release of the line: DiffDeck becomes a full review workflow rather than a diff viewer.

### Added — faster review

- Navigate previous/next visible files, unviewed files, and changed hunks from one compact review
  navigator or the command palette.
- Focus one selected file without forking review state. Focus mode persists and only fetches that
  file after reload.
- Switch between a directory tree and a virtualized flat list, ordered by path, Git status, or
  change size. The list and command menu stay responsive with 23,000 files.
- Copy a repository-relative path or exact deep link, open the configured editor at the selected
  line, and attach a file-level note when no individual line is appropriate.
- Rebuild the actual Git patch with end-of-line, spacing-amount, all-whitespace, or blank-line
  whitespace modes. Review progress and comment anchors reconcile against the new snapshot.

### Added — notes and accessibility

- Review all open, stale, and resolved file/line notes in one queue; jump, edit, reopen, or delete
  from the same surface.
- Preview the exact Markdown or versioned JSON packet before copying, downloading, or sending it to
  the launch terminal.
- A first-class linear accessible patch with coherent line prefixes/numbers, keyboard change
  navigation, reachable comment actions, existing note bodies/statuses, and a clear Rich diff
  return path.
- Audited and regression-tested tree/list semantics, scrollable code regions, modal isolation,
  focus restoration, forced colors, reduced motion, and light/dark contrast.

### Changed — interface system

- Desktop uses a persisted resizable Files/Review split. Narrow layouts use explicit Files and
  Review places, preserving patch height and surviving live orientation/viewport changes.
- Destructive reset and Git actions share one scoped, Cancel-first confirmation dialog.
- Loading, empty, filtered, recoverable error, fatal error, binary, conflict, stale, and disabled
  states use one documented language and visual system in `DESIGN.md`.
- Per-file chrome is budgeted by how often it is used: elements drawn per header at rest went from
  10 to 4. The header keeps the path, line counts, and `Viewed`; the note button and an overflow
  menu (copy path/link, open in editor, staging operations) hold their layout space but stay
  transparent until the row is hovered, focused, or selected, so nothing shifts as they appear.
  They also reveal on touch, which has no hover state, and while the row's own menu is open.
- The sidebar review navigator is a single segmented bar that degrades by dropping the hunk counter
  and then tightening its buttons, instead of wrapping to a second row and truncating the filter
  label at the default sidebar width.
- Added `ui/menu.tsx`, an anchored popover built on the fixed-position `<dialog>` pattern the
  settings and filter panels already use — no new dependency. It flips above the trigger near the
  viewport bottom, supports arrow-key navigation, and restores focus to the trigger on Escape.
- Upgraded `@pierre/diffs` to 1.2.12 and `@pierre/trees` to beta.5 after a compatibility,
  accessibility, worker, tree-selection, and bundle audit.
- Three-way before/after screenshots for the whole interface, all rendered from one shared fixture,
  live in `docs/PR_VISUAL_COMPARISON.md`.

### Fixed

- Combined merge-conflict output no longer crashes the unified parser.
- Regular-file→symlink changes no longer appear twice; diff hydration no longer follows a symlink
  target.
- Fixed a realpath escape through "Open in editor".
- Fixed deep-link ownership races, the first-change comment target, command labels, accessible note
  visibility, dark toast theme, responsive blank panes, and recoverable refresh behavior.
- Fixed Node 20 installed-package startup when Pierre evaluates browser Navigator fields.
- Every sensitive route is covered for missing/malformed/duplicated tokens, path/body bounds, stale
  snapshots, and read-only/write capability behavior.
- CI: the release job installs browser runtimes, so a tagged release no longer fails on a missing
  Chromium binary after `check` was expanded to run Playwright.
- Release: `tests/cli.test.ts` and `scripts/package-smoke.mjs` read the version from `package.json`
  instead of hardcoding it, so a version bump no longer fails the release workflow after the tag is
  pushed.

### Verification

- 80 unit/integration tests with enforced per-file ≥85% coverage; overall 97.58% lines / 98.54%
  functions.
- 21 browser cases across Chromium, Firefox, and WebKit, including seven visual baselines and Axe.
- Adversarial fixtures for empty/unborn/conflict/mixed/unusual-path/binary/huge inputs and 23,000
  files.
- Installed-tarball smoke on Node 20 and Node 24 through the real bin symlink, with three clean
  start/shutdown cycles.

See `docs/RELEASE_VERIFICATION_2026-07-16.md` and `docs/BUG_BASH_2026-07-16.md` for exact evidence.

[0.8.0]: https://github.com/ParthJadhav/DiffDeck/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/ParthJadhav/DiffDeck/compare/v0.6.2...v0.7.0
[0.6.2]: https://github.com/ParthJadhav/DiffDeck/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/ParthJadhav/DiffDeck/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/ParthJadhav/DiffDeck/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/ParthJadhav/DiffDeck/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/ParthJadhav/DiffDeck/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/ParthJadhav/DiffDeck/compare/v0.4.1...v0.5.0
