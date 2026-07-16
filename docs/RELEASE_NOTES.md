# DiffDeck next release

These notes describe the verified changes after 0.4.1. The package version remains 0.4.1 until the
release is intentionally cut.

## Faster review

- Navigate previous/next visible files, unviewed files, and changed hunks from one compact review
  navigator or the command palette.
- Focus one selected file without forking review state; focus mode persists and only fetches that
  file after reload.
- Switch between a directory tree and a virtualized flat list, ordered by path, Git status, or
  change size. The list and command menu stay responsive with 23,000 files.
- Copy a repository-relative path or exact deep link, open the configured editor at the selected
  line, and attach a file-level note when no individual line is appropriate.
- Rebuild the actual Git patch with end-of-line, spacing-amount, all-whitespace, or blank-line
  whitespace modes. Review progress and comment anchors reconcile against the new snapshot.

## Notes and accessibility

- Review all open, stale, and resolved file/line notes in one queue; jump, edit, reopen, or delete
  from the same surface.
- Preview the exact Markdown or versioned JSON packet before copying, downloading, or sending it to
  the launch terminal.
- Use a first-class linear accessible patch with coherent line prefixes/numbers, keyboard change
  navigation, reachable comment actions, existing note bodies/statuses, and a clear Rich diff
  return path.
- Tree/list semantics, scrollable code regions, modal isolation, focus restoration, forced colors,
  reduced motion, and light/dark contrast were audited and regression-tested.

## Interface system

- Desktop uses a persisted resizable Files/Review split. Narrow layouts use explicit Files and
  Review places, preserving patch height and surviving live orientation/viewport changes.
- Destructive reset and Git actions share one scoped, Cancel-first confirmation dialog.
- Loading, empty, filtered, recoverable error, fatal error, binary, conflict, stale, and disabled
  states use one documented language and visual system in `DESIGN.md`.
- `@pierre/diffs` is upgraded to 1.2.12 and `@pierre/trees` to beta.5 after a compatibility,
  accessibility, worker, tree-selection, and bundle audit.

## Correctness and hardening

- Fixed combined merge-conflict output crashing the unified parser.
- Fixed regular-file→symlink changes appearing twice and prevented diff hydration from following a
  symlink target.
- Fixed realpath escape through “Open in editor.”
- Fixed deep-link ownership races, the first-change comment target, command labels, accessible note
  visibility, dark toast theme, responsive blank panes, and recoverable refresh behavior.
- Fixed Node 20 installed-package startup when Pierre evaluates browser Navigator fields.
- Every sensitive route is covered for missing/malformed/duplicated tokens, path/body bounds, stale
  snapshots, and read-only/write capability behavior.

## Verification

- 80 unit/integration tests with enforced per-file ≥85% coverage; overall 97.58% lines / 98.54%
  functions.
- 21 browser cases across Chromium, Firefox, and WebKit, including seven visual baselines and Axe.
- Built adversarial fixtures for empty/unborn/conflict/mixed/unusual-path/binary/huge inputs and
  23,000 files.
- Installed-tarball smoke on Node 20 and Node 24 through the real bin symlink, with three clean
  start/shutdown cycles.

See `docs/RELEASE_VERIFICATION_2026-07-16.md` and `docs/BUG_BASH_2026-07-16.md` for exact evidence.
