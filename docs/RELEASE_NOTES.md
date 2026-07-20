# DiffDeck 0.5.1

This patch release fixes internal parser paths appearing as changed files when comparing revisions.

## Fixes

- Force stable `a/` and `b/` prefixes for Git diff output, overriding repository or global
  `diff.srcPrefix` and `diff.dstPrefix` settings.
- Prevent the parser's internal `.diffdeck-parser-path` placeholders from reaching the file tree.
  If an unsupported Git header cannot be resolved, DiffDeck now reports a bounded error instead of
  displaying a fake repository path.

## Verification

- Added a regression repository that compares `master~1` with `master` under custom Git diff
  prefixes. A mode-only change now resolves to `script.sh` instead of
  `.diffdeck-parser-path/0-new`.
- Added a fail-closed regression test for unresolved parser paths.
- Verified unit/integration tests, typechecking, linting, formatting, and the production build.
