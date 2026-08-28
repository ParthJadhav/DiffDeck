# DiffDeck 0.7.0 — typing always wins

The 0.6 line had one keyboard bug that undermined the whole review loop: start a comment from the
gutter, after `n`/`p`, or on a deep-linked line, and the first letters you typed went to shortcuts
instead of the box. `s` opened settings, `j` changed files, `a` flipped to the accessible view, and
the note was lost. The cause was the deep-link landing: every diff re-render scrolled to the
selected line and focused it, pulling focus out of the textarea that had just opened.

0.7.0 replaces ad-hoc checks with one keyboard policy (`src/client/lib/keyboard.ts`):

1. **Text entry wins.** Focus in any input, textarea, select, or contenteditable — including
   inside open shadow roots — means every key is typing.
2. **Overlays own the keyboard.** A modal dialog, or focus inside a popover, menu, or the command
   palette, silences single-key shortcuts until it closes.
3. **Otherwise shortcuts run.** Auto-repeat only steps through files and hunks; IME composition
   keys are never shortcuts.

Every composer now tells you how to hand the keyboard back: `Cmd/Ctrl+Enter` to finish, `Esc` to
leave with the draft intact. Focus stays on the note afterwards, so the next `j` or `n` starts from
where you were. Landing on a line happens once per location and never steals focus from a field.

Verified end to end in Chrome by typing character by character into every text surface — line
composer (gutter, drag, `c`, deep link), edit, file-level note, review-note editor, accessible
patch note, path filter, file search, command palette — and asserting nothing else moved. See
`e2e/keyboard.e2e.ts` and `CHANGELOG.md`.

---

# DiffDeck 0.6.0 — everything since 0.4.1

DiffDeck started as a way to read a `git diff` in a browser. Across 0.5.0 → 0.6.0 it became a
durable review workflow: navigate, filter, mark viewed, annotate, reconcile across refreshes, and
hand the whole reviewed packet to your coding agent.

Install or update:

```sh
npm install -g @parthj/diffdeck@latest
```

Per-version detail lives in [`CHANGELOG.md`](../CHANGELOG.md). This document is the combined story.

---

## Review at speed

- **One review navigator.** Jump to previous/next visible file, next unviewed file, or next changed
  hunk from a single compact segmented bar — or from the command palette.
- **Focus mode.** Isolate one file without forking review state. It persists across reload and only
  refetches that file.
- **Tree or flat list.** Switch between a directory tree and a virtualized flat list ordered by
  path, Git status, or change size. Both stay responsive at 23,000 files.
- **Filters.** `/` opens the review filters panel and focuses the path filter, whether or not the
  panel was already open.
- **Whitespace modes.** Rebuild the real Git patch with end-of-line, spacing-amount,
  all-whitespace, or blank-line modes. Review progress and comment anchors reconcile against the
  new snapshot.
- **Deep links and editor handoff.** Copy a repo-relative path or an exact deep link, or open your
  configured editor at the selected line.

## Notes that survive a refresh

- **One notes queue.** Every open, stale, and resolved file/line note in one surface — jump, edit,
  reopen, or delete from there.
- **File-level notes** for when no individual line is the right anchor.
- **Re-review summary.** After the repository changes, the sidebar shows what reconciliation did,
  with one-click **Delete stale** and **Clear resolved**.
- **Honest reconciliation.** Notes are re-anchored against the *new* snapshot's diffs. Previously
  they were matched against the outgoing snapshot's cached diffs, which silently reverted every
  note to "open".
- **Packet preview.** See the exact Markdown or versioned JSON packet before copying it,
  downloading it, or sending it straight to the launch terminal.

## An interface that holds up

- **Per-file chrome budgeted by use.** A file header drew ten elements at rest; it now draws four —
  path, line counts, `Viewed`. The note button and an overflow menu (copy path/link, open in
  editor, staging operations) keep their layout space but stay transparent until the row is
  hovered, focused, or selected, so nothing shifts as they appear. They also reveal on touch, which
  has no hover state, and while the row's own menu is open.
- **A navigator that degrades instead of wrapping.** The sidebar bar drops the hunk counter, then
  tightens its buttons — instead of wrapping to a second row and truncating "Filter r…" at the
  default sidebar width.
- **Resizable, persisted split.** Desktop keeps a Files/Review split you can drag. Narrow layouts
  use explicit Files and Review places that preserve patch height across live orientation and
  viewport changes.
- **One confirmation dialog.** Destructive reset and Git actions share a scoped, Cancel-first
  dialog.
- **One state language.** Loading, empty, filtered, recoverable error, fatal error, binary,
  conflict, stale, and disabled states are documented and visually unified in `DESIGN.md`.
- **New anchored menu primitive** (`ui/menu.tsx`) built on the fixed-position `<dialog>` pattern the
  settings and filter panels already use — no new dependency, flips near the viewport bottom,
  arrow-key navigable, restores focus on Escape.

## Accessibility, audited

- A first-class linear accessible patch with coherent line prefixes and numbers, keyboard change
  navigation, reachable comment actions, existing note bodies and statuses, and a clear Rich diff
  return path.
- Tree/list semantics, scrollable code regions, modal isolation, focus restoration, forced colors,
  reduced motion, and light/dark contrast were all audited and regression-tested.

## Correctness and hardening

- Combined merge-conflict output no longer crashes the unified parser.
- Parser placeholder paths no longer leak into the diff view.
- Regular-file→symlink changes no longer render twice, and diff hydration no longer follows a
  symlink target.
- Fixed a realpath escape through "Open in editor".
- Unstaging a renamed file restores both index entries instead of leaving the old path's staged
  deletion dangling.
- Write actions no longer fire 404 diff requests (and a transient error card) for files the action
  just removed from the diff.
- The terminal-packet request consumes its response body, so browsers stop reporting the completed
  request as aborted during later navigation.
- Restored the rich diff comment button.
- Fixed deep-link ownership races, the first-change comment target, command labels, accessible note
  visibility, the dark toast theme, responsive blank panes, and recoverable refresh behavior.
- Fixed Node 20 installed-package startup when Pierre evaluates browser Navigator fields.
- Every sensitive route is covered for missing/malformed/duplicated tokens, path and body bounds,
  stale snapshots, and read-only/write capability behavior.
- Upgraded `@pierre/diffs` to 1.2.12 and `@pierre/trees` to beta.5 after a compatibility,
  accessibility, worker, tree-selection, and bundle audit.

## Verification

- **Unit/integration:** 80 tests, enforced per-file ≥85% coverage, 97.58% lines / 98.54% functions
  overall.
- **Browser:** 21 cases across Chromium, Firefox, and WebKit, including seven visual baselines and
  Axe.
- **Flows:** `e2e/flows.e2e.ts` — 13 specs across the command palette, every global shortcut, the
  viewed lifecycle, filters, comment lifecycle and packet actions, deep links, image comparison
  modes, dependency summaries, binary and unusual paths, diff settings, auto-collapse, the
  heavy-diff fallback, and editor handoff.
- **Mutations:** `e2e/mutations.e2e.ts` — a real `diffdeck` process per test on a disposable
  repository, covering staging, hunk-scoped staging, whole-file revert, watch events with manual
  and auto refresh, note reconciliation, terminal packet delivery, cached-mode rename unstaging,
  and merge-conflict rendering.
- **Fixtures:** adversarial empty/unborn/conflict/mixed/unusual-path/binary/huge inputs and 23,000
  files.
- **Packaging:** installed-tarball smoke on Node 20 and Node 24 through the real bin symlink, with
  three clean start/shutdown cycles.
- **Release pipeline:** the release job installs browser runtimes, and version assertions read
  `package.json` — the two failures that previously surfaced *after* a tag was pushed.
- CI uploads Playwright traces and reports on failure.

Evidence: `docs/RELEASE_VERIFICATION_2026-07-16.md` and `docs/BUG_BASH_2026-07-16.md`.
