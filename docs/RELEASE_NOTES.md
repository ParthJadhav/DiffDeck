# DiffDeck 0.5.2

This patch release restores the add-comment button in the rich diff after the Pierre 1.2 upgrade.

## Fixes

- Register the gutter utility callback required by `@pierre/diffs` 1.2 so clicking the `+` control
  once again opens the line comment composer.
- Keep gutter clicks and dragged line selections on the same comment-creation path, preserving
  selection state, comment anchors, and existing composer behavior.

## Verification

- Added a Chromium regression test that hovers a changed line, clicks the gutter `+`, enters a
  comment, saves it, and verifies the saved note inline.
- Reproduced the failure against 0.5.1 before the fix and verified the complete flow in the live
  application after the fix.
- Verified unit/integration tests, typechecking, linting, formatting, packaging, and the production
  build.
