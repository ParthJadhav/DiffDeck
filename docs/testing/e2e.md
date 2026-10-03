# E2E testing

DiffDeck uses both its established Playwright suites and [tester-army/e2e](https://github.com/tester-army/e2e).
Both run in installed **Google Chrome**. Test fixtures create disposable Git repositories under the
operating system's temporary directory; stage, unstage, revert, and watch tests never use this working
repository as their fixture.

## Setup and commands

The application supports Node 20+, while the tester-army runner requires Node 22.12+. Use Node 24 and
Bun for development. The pinned, compatible dependencies are `e2e@0.16.0`, `@e2e-dev/web@0.11.2`,
`playwright@1.63.0`, and `@playwright/test@1.63.0`.

```sh
bun install --frozen-lockfile
# Required only where Google Chrome is not already installed:
npx playwright install --with-deps chrome

bun run check                  # full release gate, including both browser suites
bun run test:army              # build, then run tester-army
bun run test:army:built        # tester-army using the existing dist build
npx e2e list                   # discover tester-army tests without starting Chrome
npx e2e run e2e-army/repository.e2e.ts
npx e2e run --grep 'repository changes after review'
DIFFDECK_E2E_HEADED=1 npx e2e run
bun run test:e2e               # build, then run the established Playwright suite
```

No AI model, subscription login, API key, or agent step is needed. These are deterministic suites.
`e2e.config.ts` selects only `e2e-army/**/*.e2e.ts`; Playwright selects only `e2e/*.e2e.ts`. Their
incompatible test-registration imports cannot collide. `tsconfig.e2e.json` checks the new config,
provider, and tests as part of the regular typecheck gate.

The tester-army command starts the built CLI on `127.0.0.1:4311` through `app.command`, with a
separate review fixture. Playwright uses `4187`. Per-test mutation repositories launch additional
servers on free loopback ports. The runner shuts down its command, and fixture teardown stops
per-test servers and removes their repositories. Run browser suites sequentially when using the
same fixed port.

The published web engine does not accept `channel` or `executablePath`. The supported
`BrowserProvider` in `e2e-army/chrome-provider.ts` launches Playwright with `channel: "chrome"` and
leases its local CDP endpoint to the engine. Missing Chrome fails launch; there is no Chromium
fallback. `DIFFDECK_E2E_HEADED=1` controls this provider's visible browser. CI installs Chrome and
uses Node 24 before running `check`.

## Flow coverage

| Flow | Evidence suites |
| --- | --- |
| CLI flags, pathspecs, invalid input, help/version, actual installed package bin, clean shutdown | `tests/cli.test.ts`, fixture verification, `scripts/package-smoke.mjs` |
| Review shell, current selection, next/previous file/hunk, deep links, keyboard ownership, command palette | `e2e/core.e2e.ts`, `flows.e2e.ts`, `keyboard.e2e.ts`, `sidebar.e2e.ts`; army review suite |
| Tree folding, flat list, path search, unusual paths, file order, virtualization at 23,000 files | `e2e/sidebar.e2e.ts`, `chromium.e2e.ts`, `flows.e2e.ts`; army review suite |
| Path/extensions/status/dependency/conflict filters, zero results, clear filters, hide viewed | `e2e/flows.e2e.ts`, `sidebar.e2e.ts`; army review suite |
| Line and file notes, edit/delete/clear, draft focus, chord submission, reload persistence, stale/resolved reconciliation | `e2e/keyboard.e2e.ts`, `flows.e2e.ts`, `mutations.e2e.ts`; army review suite |
| Exact Markdown/JSON preview, JSON download, Unicode/quotes/newlines, copy, clipboard failure, terminal handoff | `e2e/chromium.e2e.ts`, `flows.e2e.ts`, `mutations.e2e.ts`; army review suite; packet unit tests |
| Viewed progress, skip viewed, reset cancellation/confirmation, collapse, focus mode persistence | `e2e/flows.e2e.ts`, `sidebar.e2e.ts`; army review suite |
| Theme/layout/line numbers, whitespace modes, settings persistence | `e2e/flows.e2e.ts`, `chromium.e2e.ts`; army review suite; Git whitespace unit tests |
| Phone drawer, responsive resize/overflow, accessible linear patch and shared notes, automated accessibility, visual snapshots | `e2e/chromium.e2e.ts`, `core.e2e.ts`, `visual.e2e.ts`; army review suite |
| Image side-by-side/overlay/swipe, binary placeholder, dependency summary/source, large and heavy diffs | `e2e/flows.e2e.ts`, `visual.e2e.ts` |
| Working-tree/cached/commit range, rename, conflict, raw untracked vs intent-to-add | `e2e/mutations.e2e.ts`; army repository suite; Git/fixture unit tests |
| Stage/unstage/revert whole files and individual hunks, real index/worktree state, cancel, read-only, stale authorization, cached rename revert | `e2e/mutations.e2e.ts`; army repository suite; server regressions |
| Manual/automatic watch refresh, note reconciliation, missing editor, session retry, preference/refresh failure without losing review | `e2e/mutations.e2e.ts`, `chromium.e2e.ts`; both army suites |
| Capability token enforcement, unauthorized paths, symlink escapes, structural/editor adapter success/failure/timeouts, body limits | `tests/server.test.ts`, fixture verification |

Untracked files follow `git diff`: they appear after `git add -N`, rather than silently changing the
chosen diff scope. Reload retains the server's current snapshot; **Refresh diff** rebuilds it when
watch is disabled. Tests use those explicit application contracts.

## Reproduced bugs fixed

1. A non-watching session accepted the original snapshot ID after the worktree changed and could
   stage or discard unseen contents. The write endpoint now rebuilds immediately before mutation
   and rejects a changed snapshot with HTTP 409. Server regressions cover both stage and revert;
   the Chrome regression also verifies the Git index remains untouched.
2. Reverting a staged rename restored only the new path, leaving the original path's staged deletion.
   Cached whole-file revert now includes both rename paths. Unit and Chrome regressions assert a
   clean Git status and the original file contents.
3. Cancelling a note edit briefly dropped focus to the document body until an animation frame.
   Focus now returns to the note card in React's layout commit. The original failing keyboard test
   passed five consecutive Chrome runs, and the new army test verifies focus and saved-body preservation.

## Verification and artifacts

Implementation run on 2026-10-03 used Node `v24.15.0`, Bun `1.3.9`, and Google Chrome
`154.0.8037.97`.

- `bun test tests/server.test.ts`: **21 passed**, including two new server regression tests.
- `npx playwright test e2e/keyboard.e2e.ts --grep 'file-level and review-note' --repeat-each=5 --reporter=line`:
  **5 passed** after the focus fix.
- `npx e2e run --output .e2e/verified`: **18 passed**, zero model calls.
- `bun run check`: **passed**; typecheck (including army tests), lint, format, source and built
  fixtures, **100 unit tests**, build, pack dry run, installed Node 24 tarball smoke with three clean
  start/shutdown cycles, **55 Playwright Chrome tests**, and **18 tester-army Chrome tests**.
  Full implementation log: `/tmp/diffdeck-check-implementation.log`.

Tester-army writes `.e2e/report.json`, `.e2e/summary.md`, and `.e2e/junit.xml`. Every result includes
step outcomes and artifact references. Explicit screenshots and real packet downloads are kept as
attempt artifacts; failed runs additionally keep screenshots, screen text, and Playwright traces.
Use `--output` to preserve independent verification runs. Existing Playwright evidence lives in
`test-results/` and `playwright-report/`; neither runner touches the pre-existing `test-results-chrome/`
or `videos/` directories.

Coverage is local Google Chrome coverage. Optional Difftastic and editor binaries are verified with
fixture executables and unavailable-binary paths, not a user's installed editor or Difftastic UI.
No AI exploration, other browser engine, hosted CI run, or Node 20 runtime run is claimed by these
local results. The CI package-smoke matrix retains Node 20 and 24 coverage for future runs.

Follow-up verification reproduced an asynchronous watch result overwriting newer write, manual-refresh and preference snapshots. Both the server publication generation and CLI fingerprint generation now discard superseded polls. Three delayed-poll regressions failed before the fix and passed afterwards. The line-comment keyboard handoff now focuses after Pierre attaches its shadow slots, with synchronous shortcut creation; ten focused immediate-typing runs passed, and the army suite types immediately without a focus-readiness wait. The multiple-note regression verifies cancellation and save return focus to the exact edited note, preserve the other note, and consume Escape (`defaultPrevented`).

Latest full gate: `/tmp/diffdeck-resize-fullcheck.log`, **100 unit + 55 legacy Chrome + 18 tester-army Chrome tests passed**, with no skips. The desktop-to-phone test now queries the exact Files button name so the assertion retries through the React resize commit without matching other desktop controls. Ten focused resize repetitions passed (`/tmp/diffdeck-resize-repeat.log`); prior Luna failure artifacts are preserved in `/tmp/diffdeck-luna-resize-failure`. Final independent Luna verification passed the canonical gate with exit code 0: 100 unit, 55 Playwright Chrome and 18 tester-army Chrome tests, zero skips/retries/model calls and complete owned cleanup. Report: `/Users/parthjadhav/research/e2e-rollout-2026-10-03/diffdeck-luna-final.md`. Hosted CI and additional platforms remain outside the local claim.
