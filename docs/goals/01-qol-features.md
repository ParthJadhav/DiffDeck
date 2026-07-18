# Goal 1 — QOL Features for Faster Review

Status: complete — verified 2026-07-16

## Objective

Add a cohesive set of quality-of-life features that reduce navigation, interpretation, and
handoff friction during a real review without expanding DiffDeck into a general-purpose Git client.

The goal is not “more controls.” It is fewer repeated actions between opening a diff, understanding
it, leaving review notes, and handing those notes to an agent.

## Research Rationale

Established review tools converge on a few durable patterns:

- Large reviews need both file-level and change-level navigation.
- Reviewers benefit from switching between all-files scanning and one-file focus.
- Paths and exact diff locations must be easy to copy and share.
- Whitespace-only churn needs a trustworthy, reversible view preference.
- Review comments need a consolidated queue as well as inline context.
- Screen-reader users need a linear patch representation, not only a visually rich two-column diff.

DiffDeck already provides the foundations for these ideas: stable file and line deep links,
virtualized file rendering, comment anchors, review persistence, Git-backed refreshes, command
palette actions, and editor integration. The work should extend those foundations.

## Required Feature Slices

### F1 — Review navigator and focus mode

Add a compact review navigator that supports:

- previous and next visible file;
- previous and next unviewed file;
- previous and next changed hunk within the selected file;
- a persistent one-file focus mode with explicit return to all-files mode;
- honest, separate command-palette entries and discoverable keyboard shortcuts for each action;
- disabled/end-of-list states that explain why navigation cannot proceed;
- synchronized file tree selection, URL state, scroll position, focus, and virtualized content.

Focus mode must keep comments, viewed state, filters, and refresh reconciliation identical to the
all-files view. It must not fork review state.

### F2 — File and location utilities

Add low-friction actions in a consistent file-header action surface:

- copy repository-relative file path;
- copy a capability-token-safe deep link to the selected file and line/range;
- open the configured editor at the selected line instead of always line 1;
- create a file-level review comment when no individual line is appropriate;
- show useful success/failure feedback without moving focus or interrupting reading.

Links must never leak a capability token through packet exports, displayed text, logs, or copied
repository-relative paths. File-level comments must use the canonical packet and reconciliation
model and remain distinguishable from line comments.

### F3 — Diff interpretation preferences

Add review preferences for:

- normal whitespace behavior;
- ignoring end-of-line whitespace;
- ignoring changes in the amount of whitespace;
- ignoring all whitespace;
- optionally ignoring all-blank-line changes when Git can represent it without ambiguous state;
- flat list versus directory tree file navigation;
- deterministic file ordering by path, change status, or change size.

Whitespace behavior must be implemented at the Git diff source, using documented Git semantics,
not by visually hiding already-parsed lines. The UI must clearly state that the displayed patch has
changed. Toggling the preference must safely refresh the snapshot and reconcile viewed files and
comment anchors; it must not silently attach a comment to the wrong line.

Tree/list and ordering preferences must preserve selected-file identity, filters, viewed state, and
deep links. Use the existing tree package for tree mode and Virtuoso for any large flat collection.

### F4 — Review notes hub and packet preview

Add a consolidated review-notes surface that:

- lists file-level and line-level comments in deterministic file/line order;
- filters open, stale, and resolved notes;
- jumps to and focuses the source annotation;
- supports edit and delete with the same behavior as the inline annotation;
- makes stale and resolved state understandable and recoverable;
- previews the exact Markdown and JSON packet before copy, download, or terminal submission;
- preserves the existing fast one-click copy path.

This surface must be progressive and non-modal for routine use. It should collapse out of the way
and must remain usable at 320–600 px widths.

### F5 — Accessible patch view

Add an accessible, linear unified-patch view for the selected file:

- semantic line prefixes and line numbers that a screen reader announces coherently;
- keyboard next/previous difference navigation;
- comment and copy-link actions reachable without pointer hover;
- a clear return path to the rich visual diff;
- bounded rendering for large files, with an honest fallback when full output is impractical.

This is a first-class review mode, not hidden assistive text that diverges from the displayed diff.
It must use the same source, comment anchors, filters, and review state as other modes.

### F6 — Upstream capability audit

Review the current stable releases and migration notes for `@pierre/diffs` and `@pierre/trees`.
Upgrade only when doing so removes local workarounds, fixes a relevant defect, improves
accessibility/performance, or enables a required feature. Record the decision either way. If an
upgrade occurs, test all custom headers, annotations, hunk expansion, workers, heavy-file fallback,
and tree selection behavior before accepting it.

## Implementation Rules

- Shape each feature against the live desktop and responsive app before coding it.
- Deliver each feature as a vertical slice: domain model, server/API if needed, client UI,
  persistence/migration, errors, accessibility, tests, and documentation together.
- Extend `ReviewSession`, `DiffSource`, and `ReviewPacket` where they own the behavior. Do not create
  competing stores or packet formats.
- Keep write functionality fully gated by existing capability checks.
- Reuse `cmdk`, Virtuoso, and Sonner for their established roles.
- Add no shortcut that fires while typing, selecting text, editing a comment, or using a native
  control.
- Every preference and action must have default, hover, focus, active, disabled, loading, success,
  and failure behavior where applicable.
- Avoid optimistic success for clipboard, editor, terminal, refresh, or mutation operations.

## Acceptance Evidence

### Unit and integration

- Navigation reducers/selectors cover empty, filtered, first/last, viewed/unviewed, renamed, and
  removed-file cases.
- URL tests cover file-level comments, line/range links, encoded Unicode paths, spaces, `#`, `?`,
  and remote capability tokens.
- ReviewSession migration and reconciliation tests cover every new persisted field and whitespace
  refresh behavior.
- DiffSource tests prove each whitespace mode invokes Git safely and produces the expected patch.
- ReviewPacket snapshots cover mixed file/line notes and all statuses.
- Editor tests prove selected-line forwarding and safe fallback to line 1.

### Browser

- Keyboard-only walkthrough for every new action, including command palette discovery and focus
  restoration.
- All-files/focus-mode transitions at 320, 600, 768, 1024, and 1440 px with filters and comments
  active.
- Next/previous hunk navigation across collapsed context and virtualized files.
- Whitespace toggling through refresh with unchanged, shifted, stale, and resolved comments.
- Tree/list and sorting with at least 23,000 files without lost selection or blocked input.
- Notes hub create/edit/delete/jump/export flows, including long text and stale notes.
- Accessible patch view checked with the browser accessibility tree and a screen-reader-oriented
  keyboard pass.
- No unexpected console error, failed request, focus loss, page overflow, or stale URL after any
  scenario.

### Performance and packaging

- No required feature increases the initial entry gzip size by more than 10% without a measured,
  documented reason and explicit compensating work.
- One-file mode does not fetch or render unrelated heavy files.
- Large comment lists and flat file lists are virtualized when measurement proves it necessary.
- `bun run check`, the browser suite, `bun run pack:dry-run`, and a clean installed-package smoke
  test pass.

## Done Condition

This goal is done only when F1–F6 have an explicit shipped result or, for F6, a written evidence-based
no-upgrade decision; every acceptance scenario is automated where maintainable and manually
verified where browser or assistive behavior requires it; documentation and shortcuts match the
product; and no defect discovered while building these features remains open.

## Completion evidence

| Slice | Shipped result and proof |
| --- | --- |
| F1 | Visible/unviewed file and hunk navigation, persistent focus mode, cmdk commands, honest boundaries; selector tests and browser persistence/request-isolation checks. |
| F2 | Path/link clipboard actions, selected-line editor launch, file notes, async success/failure feedback; deep-link/server and file-utilities E2E. |
| F3 | Five Git-owned whitespace modes, persisted tree/flat view and path/status/size ordering; whitespace, ReviewSession, 23,000-file, and preference E2E. |
| F4 | Deterministic notes queue with status filters/edit/delete/reopen/jump and exact Markdown/JSON preview; packet units and complete handoff E2E. |
| F5 | Lazy bounded linear patch with keyboard navigation, comments, existing note bodies/statuses, and rich-view return; unit, Axe, keyboard, and narrow visual checks. |
| F6 | Pierre stable upgrade accepted and verified in `docs/research/pierre-dependency-audit-2026-07-16.md`. |

The exact release evidence is in `docs/RELEASE_VERIFICATION_2026-07-16.md`; no feature-build defect
remains open in `docs/BUG_BASH_2026-07-16.md`.
