# Release verification — 2026-07-16

Status: complete

This is the reproducible evidence record for the QOL, whole-system UX/UI, and bug-bash goals. The
canonical command is `bun run check`; fixture and package scripts create and clean their own
temporary repositories and install prefixes.

## Automated gates

| Gate | Recorded result |
| --- | --- |
| TypeScript | Client and server projects pass with no errors. |
| Lint | Oxlint passes with zero warnings/errors. |
| Formatting | Biome passes; build, Playwright, and package outputs are excluded. |
| Unit/integration | 80 tests pass. |
| Coverage | 97.58% lines / 98.54% functions overall. Git 90.47% / 98.21%; server 91.07% / 95.74%; ReviewSession 98.31% / 97.62%; ReviewPacket, CLI parsing, and Node compatibility 100% / 100%. Every reported module clears the 85% per-file gate. |
| Browser | 21 cases: 19 pass, 2 intentional non-Chromium Axe skips; Chromium product matrix plus Firefox/WebKit core paths. A manual in-app system-browser smoke also covered desktop rendering, focus mode, command search, and clean diagnostics. |
| Visual/a11y | Seven stable screenshots; no serious/critical Axe violations in representative states. |
| Built fixtures | Edge fixture parses 22 unique changes; 23,000 unique files parse inside the 30 s guardrail. |
| Production | Client/server build, dry-run npm pack, installed tarball, and real bin symlink pass. |
| Runtime matrix | Installed tarball passes on Node 20.20.2 and 24.15.0, including three start/shutdown cycles per run. CI repeats Node 20/24 on Linux. |

`src/server/cli.ts` is deliberately excluded from Bun's unit coverage calculation: its extracted
parser is 100% covered, while executable orchestration is exercised more faithfully by the
installed-tarball and repeated-process smoke. This uses Bun's documented
`coveragePathIgnorePatterns`; it is not an uncovered risk waiver.

## Product and failure-state matrix

| State | Recovery/contract | Focused evidence |
| --- | --- | --- |
| Initial and slow load | Stable loading shell, then usable review | Delayed `/api/session` browser assertion |
| Empty and unborn | Distinct “No diff to render” state; no parser crash | Empty visual, built-fixture gate |
| Invalid Git/repository removed | Structured reason and Retry; loaded content retained for refresh errors | CLI/Git tests, fatal-error visual, session recovery E2E |
| File load failure | Scoped file error with retry; unrelated content remains | API error paths and shell recovery assertions |
| Heavy/huge line/file | Auto-collapse/bounded rendering; no eager unrelated focus fetch | Edge fixture, focus request isolation, heavy intent files |
| Binary/unsupported image | Honest placeholder or supported image comparison | Git/server binary tests, image visual |
| Malformed dependency data | Summary falls back to source diff without throwing | dependency unit test |
| Merge conflict/combined diff | Unresolved conflict remains visible; unified parser does not crash | real merge unit test, conflict built fixture |
| Watch/deferred update | Prepared session swaps atomically; event teardown is bounded | watch server test, diagnostics fixture |
| Stale/resolved notes | Text status, safe re-anchor/reopen, no silent attachment | ReviewSession tests, accessible/shared-note browser path |
| Editor/structural unavailable | Capability is absent or response explains restart/install | server executable tests |
| Remote token | Every API/SSE/blob/write route rejects missing/malformed/duplicated tokens | server token matrix |
| Network/session failure | Current patch survives recoverable error; first load offers Retry | recovery E2E and error visual |
| Worktree/cached/mixed | Correct session identity and allowed write actions | Git and write-route tests, review fixture |
| Commit/range | Read-only even with `--write`; two-commit and symmetric range parse | Git/server tests |
| Mutation preview/confirm/stale | Exact file/hunk scope, Cancel focus, stale snapshot rejection | confirmation E2E and write tests |
| Clipboard success/failure | Success only after write resolves; permission failure is explicit and non-destructive | file-utilities browser test |
| Packet copy/download/terminal | Exact Markdown/JSON preview remains available; malformed/oversized bodies rejected | QOL handoff E2E, packet/server tests |

## Responsive, input, and visual matrix

| Matrix | Evidence |
| --- | --- |
| Widths 320, 375, 600, 768, 900, 1024, 1280, 1440 | One dynamic resize test, including desktop→phone→desktop→narrow, with no page overflow. |
| 200% equivalent CSS viewport | 640 px layout retains primary path and no horizontal page overflow. |
| Light/dark/system | Light desktop/dependency/image/error/empty plus dark comment/narrow screenshots; system is the default theme path. |
| Reduced motion | Confirmation duration becomes near-zero. |
| Forced colors | Primary Files/Review path, native semantics, and visible focus survive. |
| Keyboard | File/hunk navigation, command menu, modal cancel, accessible patch, comment creation, and focus restoration. |
| Pointer/touch-sized path | Narrow Files↔Review control and file selection at 320–600 px. |
| Accessibility tree | Landmarks, main region, tree/list, labelled comboboxes, modal isolation, note content, status text, and scrollable code. |

## Performance and size record

- Initial entry baseline: 230.52 kB minified / 69.43 kB gzip.
- Accepted entry: 254.82 kB minified / 76.16 kB gzip, a 9.69% gzip increase and below the 10%
  goal cap. Accessible patch, syntax grammars, worker, tree, and diff engine remain split chunks.
- Built adapter: edge fixture about 0.3 s; 23,000-file fixture about 5.8–11.3 s locally. The gate
  allows 30 s for slower CI hardware.
- The 23,000-file browser path mounts fewer than 100 flat rows, fewer than 150 cmdk items, fewer
  than 3,000 total body descendants, and fewer than 200 file-diff requests through two distant
  selections.
- Reloading persisted focus mode requests only the selected file.
- Intentional `AbortController` cancellation of unmounted diff/image requests and SSE teardown is
  ignored by diagnostics; every other console error, page error, failed request, or browser dialog
  fails the suite.

## Packaging and cleanup

`scripts/package-smoke.mjs` packs the built package with lifecycle scripts disabled, installs the
tarball in a clean prefix, invokes the real `.bin/diffdeck`, checks version/help, renders a fixture,
and repeats start/shutdown three times. Ports are checked closed afterward and all fixture/install
directories are removed in `finally` blocks. The Node 20 run also guards the server-side Pierre
Navigator compatibility shim.

## Visual evidence

Current baselines are in `e2e/__screenshots__/visual.e2e.ts/`:

- `desktop-light-write.png`
- `dependency-light.png`
- `image-light.png`
- `comment-dark.png`
- `phone-accessible-dark.png`
- `empty-light.png`
- `fatal-error-light.png`

The before-pass hierarchy findings and their dispositions are recorded in
`docs/research/ux-flow-audit-2026-07-16.md`; `DESIGN.md` records the shipped system.
