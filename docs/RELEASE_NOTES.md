# DiffDeck 0.6.0

This release completes the re-review workflow, repairs review-note reconciliation and rename
staging, and backs every user-facing flow with an end-to-end Playwright suite.

## Features

- Show the re-review summary in the sidebar after a repository change, with one-click "Delete
  stale" and "Clear resolved" actions for reconciled notes.
- Pressing `/` now opens the review filters panel and focuses the path filter even when the panel
  is closed; previously the shortcut only worked while the panel was already open.

## Fixes

- Review notes reconcile honestly after a refresh: stale and resolved statuses are computed
  against the new snapshot's diffs. Previously notes were re-anchored against the outgoing
  snapshot's cached diffs, which silently reverted every note to "open".
- Unstaging a renamed file now restores both index entries; before, the old path's staged
  deletion was left dangling in the index.
- Write actions no longer trigger 404 diff requests (and a transient error card) for files the
  action just removed from the diff.
- The "send packet to terminal" request consumes its response body so browsers no longer report
  the completed request as aborted during later navigation.

## Verification

- Added `e2e/flows.e2e.ts`: 13 Chromium specs covering the command palette, every global keyboard
  shortcut, the viewed lifecycle, review filters, comment lifecycle and packet actions (clipboard,
  JSON download, terminal), deep links, image comparison modes, dependency summaries, binary and
  unusual paths, diff settings, auto-collapse, the heavy-diff fallback, and editor handoff.
- Added `e2e/mutations.e2e.ts` and a server harness that launches a real `diffdeck` process per
  test on a disposable repository: staging, hunk-scoped staging, whole-file revert, watch events
  with manual and auto refresh, stale/resolved note reconciliation, terminal packet delivery,
  cached-mode rename unstaging, and merge-conflict rendering.
- CI uploads Playwright traces and reports when the suite fails.
- Verified unit/integration tests, typechecking, linting, formatting, fixture gates, packaging,
  the production build, and the full three-browser e2e suite.
