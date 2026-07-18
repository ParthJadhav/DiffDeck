# Goal 3 — Exhaustive Bug Bash and Release Hardening

Status: complete — verified 2026-07-16

## Objective

Systematically discover, reproduce, fix, and permanently guard defects across DiffDeck's CLI, Git
adapter, local server, security boundary, review model, browser UI, packaging, accessibility,
performance, and failure recovery after Goals 1 and 2 land.

Passing existing tests is the starting line. This goal is complete only when all discovered defects
are closed and the release evidence can be reproduced from a clean checkout.

## Starting Risk Picture

- The current 33-test suite passes, but reported module coverage is about 72% and UI components are
  mostly not instrumented.
- There is no committed browser E2E suite despite a large interaction surface and virtualization.
- High-risk code is concentrated in large Git, server, workspace, app-shell, and stylesheet files.
- DiffDeck handles adversarial inputs by nature: arbitrary valid Git path names, patch encodings,
  binary content, huge diffs, changing snapshots, optional executables, remote binding, and
  repository mutations.
- Previous manual bug bashes found P0/P1 defects in deep-link hydration, draft persistence, heavy
  file expansion, virtualization, downloads, shortcut routing, and comment reconciliation. Each is
  a regression target.

## Test Infrastructure Required Before Bashing

### B1 — Deterministic fixture factory

Create disposable repositories for at least:

- empty repository and unborn `HEAD`;
- empty diff and ordinary worktree/cached/mixed changes;
- commit, two-dot, three-dot, merge-base, rename/copy, delete/add, and type change;
- merge conflicts and combined/conflicted content;
- spaces, Unicode, leading dash, quotes, tabs, newlines, `#`, `?`, very long paths, nested paths,
  symlinks, submodules, and case-collision behavior where the filesystem permits it;
- CRLF/LF, missing final newline, invalid UTF-8, huge lines, huge files, and 23,000+ files;
- added/modified/deleted images, unsupported binary formats, malformed dependency files, and every
  supported manifest/lock format;
- watch updates during idle, scrolling, comment editing, filtering, and mutation;
- missing, slow, failing, malicious-output, and successful editor/structural executables.

Fixtures must be created and destroyed without mutating the developer's real repository.

### B2 — Committed browser regression suite

Add a deterministic E2E harness that starts the built CLI against disposable fixtures and covers
critical flows in Chromium in CI. Run the core review path in Firefox and WebKit as well unless an
engine limitation is documented with a smaller equivalent check. Capture traces/screenshots only
on failure to keep routine CI lean.

The suite must expose console errors, unhandled rejections, failed network requests, unexpected
dialogs, leaked processes/ports, and accessibility violations as test failures.

### B3 — Coverage and quality gates

- Raise instrumented first-party unit/integration line and function coverage to at least 85%.
- Reach at least 90% on security/token handling, path authorization, write mutations, ReviewSession,
  ReviewPacket, CLI parsing, and snapshot reconciliation.
- Do not chase percentages with implementation-coupled assertions. Critical uncovered branches are
  tests to write or risks to document and close.
- Add the browser suite and coverage gates to `bun run check` and CI without duplicate builds or
  nondeterministic external dependencies.

## Bug-Bash Passes

### P1 — Static and architectural pass

- Trace every external input to filesystem, Git, process execution, URL, clipboard, download, and
  mutation sinks.
- Audit stale closures, effect dependencies, event/listener cleanup, timers, abort controllers,
  virtualized state ownership, shadow DOM interactions, and race conditions.
- Find unreachable states, ambiguous booleans, duplicated validation, swallowed errors, unsafe
  casts, and accidental dependence on component mount order.
- Review the five largest first-party files for extraction opportunities that reduce bug surface.

### P2 — CLI, Git, and packaging pass

- Exercise every CLI flag alone and in valid/invalid combinations, including `--` pathspecs.
- Test shell/NPM/Bun/global symlink invocation, IPv4/IPv6 hosts, occupied/invalid ports, signals,
  browser-open failure, and current-directory/repository resolution.
- Fuzz normalized Git arguments and patch headers without permitting option/path injection.
- Verify path parsing and snapshot identity across all fixture names and diff modes.
- Build a tarball, install it in a clean temporary prefix with Node 20 and current LTS, invoke its
  actual bin symlink, render a fixture, and shut it down cleanly.

### P3 — Server, security, and mutation pass

- Attempt every API, SSE, image/blob, download, editor, structural, terminal, and write route with
  missing, malformed, duplicated, leaked, and valid tokens.
- Check loopback and remote-host caching, referrer/URL handling, error redaction, and absolute path
  exposure.
- Probe traversal, encoded traversal, symlink escape, stale snapshots, arbitrary refs/paths,
  oversized bodies/output, slow child processes, disconnects, and concurrent requests.
- Verify stage, unstage, and revert at file/hunk/range boundaries against working, cached, mixed,
  renamed, deleted, binary, and conflict states. Prove read-only mode cannot mutate.

### P4 — Review-model and refresh pass

- Corrupt, truncate, downgrade, and upgrade persisted review state.
- Reconcile comments across unchanged, shifted, duplicated, removed, renamed, ambiguous, binary,
  and whitespace-mode snapshots.
- Refresh while typing, selecting lines, filtering, changing mode, exporting, and mutating.
- Verify no draft, comment, viewed state, collapse state, filter, selection, or preference is lost or
  silently attached to the wrong source.
- Exercise multi-tab storage events without assuming synchronized scrolling or focus.

### P5 — Browser interaction and responsive pass

- Execute every mouse, touch, keyboard, and command-palette path from first launch through export.
- Test dynamic resize and orientation, not only reloads at fixed sizes.
- Test all required breakpoints, 200% zoom, long translated-like strings, long paths/counts,
  light/dark/system, reduced motion, forced colors, and slow CPU/network simulation.
- Stress file and dependency virtualization, selected-file synchronization, hunk expansion,
  comments, sticky headers, image controls, filters, and scroll restoration.
- Verify all dialogs/popovers close correctly, restore focus, escape clipping/stacking contexts, and
  never leave the background interactable.

### P6 — Accessibility pass

- Run automated WCAG checks on every representative state.
- Inspect landmarks, accessible names/descriptions, tree/list semantics, live regions, modal
  isolation, reading order, focus order, and visible focus.
- Complete the primary review workflow with keyboard only and the accessible patch view.
- Test screen-reader-oriented next/previous change navigation and comment editing.
- Verify status and diff meaning is not communicated by color alone.

### P7 — Performance, resilience, and longevity pass

- Measure cold load, initial JS/CSS, worker startup, time to first usable diff, scroll responsiveness,
  memory, DOM nodes, and request counts for small, huge-file, and huge-file-count fixtures.
- Prove collapsed and offscreen heavy files are not fetched/rendered prematurely.
- Rapidly change filters, selected files, modes, themes, and refresh generations to expose races.
- Kill Git/child processes, remove/rename the repository, disconnect SSE, fail clipboard/download,
  and exhaust an occupied port; every case needs bounded cleanup and a recovery path.
- Run repeated start/review/shutdown cycles and ensure no leaked listeners, workers, ports, temp
  files, child processes, or unbounded local-storage growth.

## Seed Defects to Reproduce First

| ID | Scenario | Observation | Initial severity | Required disposition |
| --- | --- | --- | --- | --- |
| NBB-001 | Dynamic desktop → 600 px resize | The lower diff pane rendered empty once until reload. | P1 | Reproduce deterministically, fix root cause, add dynamic-resize regression. |
| NBB-002 | Command palette file navigation | “Next / previous file” is one command that only advances. | P2 | Split into truthful previous/next actions and test each boundary. |
| NBB-003 | Destructive confirmations | Reset/revert use native confirmation while comment clearing uses in-product confirmation. | P2 | Unify confirmation behavior and test focus, cancel, and success. |

Do not assume a seed is fixed merely because it fails to reproduce once. Record environment,
viewport, state, timing, and evidence. If a seed is disproved, document the falsification and the
coverage that prevents recurrence.

## Defect Workflow

Maintain a bug-bash log with:

- stable ID, date, pass/scenario, environment, severity, and user impact;
- exact reproduction and smallest fixture;
- root cause, not only the visible symptom;
- fix summary and safety implications;
- unit/integration/E2E regression test path;
- before/after evidence and verification matrix;
- status: open, reproducing, fixing, verifying, or closed.

Severity:

- P0: data loss, unauthorized access/mutation, unusable primary flow, or crash loop.
- P1: broken core review behavior, wrong diff/comment/action, major accessibility blocker, or severe
  performance failure.
- P2: meaningful friction, misleading state, recoverable failure, or responsive defect.
- P3: minor visual/copy inconsistency with no incorrect behavior.

Fix P0/P1 immediately. Continue the full pass after the regression test is in place. P2/P3 are not
waived; every discovered defect must be closed before this goal completes.

## Final Release Matrix

- Clean macOS and Linux environments where available; Node 20 and current LTS.
- Chromium, Firefox, and WebKit core paths; system-browser manual smoke test.
- Worktree, cached, mixed, commit, range, empty, conflict, remote-token, watch, structural, editor,
  and write modes.
- 320, 375, 600, 768, 1024, 1280, and 1440 widths; 200% zoom.
- Light, dark, system, reduced motion, and forced colors where supported.
- Small diff, huge file, huge file count, binary/image, dependency, unusual paths, and malformed
  inputs.

## Done Condition

This goal—and therefore the complete improvement program—is done only when:

- every bug-bash pass and final-matrix row has recorded evidence;
- the bug log has zero open defects at P0, P1, P2, or P3;
- every fixed behavioral defect has a durable regression test at the lowest useful layer;
- coverage and browser gates are active in `bun run check` and CI;
- typecheck, lint, format, unit/integration/E2E tests, production build, dry-run pack, installed-tarball
  smoke test, and repeated start/shutdown checks all pass from a clean checkout;
- no unexpected console error, failed request, accessibility blocker, page overflow, data leak,
  unauthorized mutation, flaky test, leaked process/port, or undocumented performance regression
  remains;
- README, CLI help, screenshots, security guidance, and release notes describe the product that was
  actually verified.

## Completion evidence

- Deterministic disposable fixtures and a built-adapter matrix cover empty/unborn, mixed,
  conflict, adversarial names/content, binaries/images/manifests, type changes, optional tools, and
  23,000 files.
- The committed Playwright suite runs Chromium product/visual paths plus Firefox/WebKit core paths,
  fails on unexplained browser diagnostics, and runs Axe on representative states.
- Enforced coverage is 97.58% lines / 98.54% functions overall with >90% lines on Git and server
  boundaries and 100% CLI parsing/ReviewPacket coverage.
- P1–P7 evidence and all stable finding IDs are in `docs/BUG_BASH_2026-07-16.md`; open P0/P1/P2/P3
  counts are all zero.
- `docs/RELEASE_VERIFICATION_2026-07-16.md` records the final state, breakpoint, browser, runtime,
  performance, package, and cleanup matrix.
