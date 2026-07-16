# Static and architecture bug-bash record — 2026-07-16

## External input and sink trace

| Input | Validation/ownership | Sink and boundary |
| --- | --- | --- |
| CLI arguments | `cliOptions.ts` rejects missing/unsafe values and summary-only Git modes; `--` preserves pathspecs | Fixed-argument `spawnSync`/`execFile`; never shell interpolation |
| Repository and file paths | Git root resolution, snapshot membership, lexical containment, existing-path realpath containment | Git, image reads, configured editor |
| Diff output | 512 MB process bound, quoted-header normalization, parse diagnostics, combined-diff isolation | Pierre parser and immutable session snapshot |
| HTTP query/body | Capability middleware, fixed enums/shapes, Express body limits, snapshot/path checks | file/image/packet/editor/structural/write routes |
| Capability token | Generated for non-loopback; accepted in fixed query/header locations; every sensitive route checked | Request authorization only; packet/path exports do not strip it from an explicitly copied remote deep link and warn that it is secret |
| Review persistence | Versioned migration and structural sanitization | Browser local storage per repo+diff identity |
| Clipboard/download/terminal | Exact packet generated once; async result checked; request body bounded | Browser clipboard, form download, launch terminal stdout |
| Git mutation | Absent without `--write`; path/snapshot/action/hunk validation; exact preview patch | `git apply` through fixed arguments |
| Optional executables | Capability-detected, fixed timeout/output bounds, authorized repository path | `execFile` editor/structural adapter |

No shell string execution is used for user-controlled Git paths or refs. The one shell-like input is
the explicitly configured editor command, parsed into executable/arguments and still path-gated.

## Lifecycle and race audit

- File requests own AbortControllers; surface unmount and generation changes cancel stale work.
- Session loads use monotonic request IDs, so an older refresh cannot overwrite a newer preference
  or retry result.
- Visible-path and deep-link focus use bounded, generation-cancelled retries and clean timers.
- File-comment positioning cleans capture scroll/resize listeners; modal focus is restored.
- Watch polling prepares a session before replacing the current one and removes timers/clients on
  close.
- Review persistence writes one canonical state; rename/reconcile logic moves annotations and
  avoids competing component stores.
- Clipboard, editor, terminal, preference, refresh, and mutation flows never claim optimistic
  success.

## Five-largest-file decomposition check

Line counts reflect the completed implementation and include explicit wiring, not generated code.

| File | Approx. lines | Pressure and decision |
| --- | ---: | --- |
| `DiffWorkspace.tsx` | 1,003 | Remains the renderer orchestration boundary. New surface behavior was extracted into `AccessiblePatchView`, `MultiFileScroller`, `HeavyFileDiff`, `FileUtilities`, `FileReviewActions`, `DependencyDiff`, and `ImageDiff`. `FileDiffSection` owns per-file async/comment state. Further splitting its tightly coupled annotation callbacks would add a parallel store or a prop-only wrapper, so no mechanical extraction was accepted. |
| `git.ts` | 873 | Kept as the one patch-normalization/session-construction boundary. Parser normalization, hydration, conflict isolation, and type-change coalescing are private pure steps with 90.47% line / 98.21% function coverage. CLI parsing and whitespace policy were extracted to `cliOptions.ts` and `whitespace.ts`. |
| `App.tsx` | 779 | Acts as the composition root for one canonical ReviewSession. QOL surfaces are separate components; persistence, file fetch, tree, media query, watch, and session transport remain hooks. `DiffDeckLayout` is isolated at file bottom. Splitting the remaining controller would obscure the one-state ownership invariant. |
| `server.ts` | 621 | One Express lifecycle/router boundary, with diff ownership delegated to `DiffSource`. Mutation, path authorization, image resolution, token middleware, and process bounds are private helpers with 91.07% line / 95.74% function coverage. A router split was rejected because it would duplicate the closed-over capability/session boundary. |
| `DiffControls.tsx` | 482 | Shared popover/dialog plus small pure option primitives. Preference state remains owned by `App`; this file only renders and manages focus/position. No new independent state store was introduced. |

The total line count increased because the goal intentionally added review modes, notes, and
failure handling. The stronger boundaries above are the accepted decomposition: domain/session
state did not move into presentation components, and server validation did not spread into routes.

## Static findings resolved

- Symlink authorization and symlink diff hydration now use different safe semantics: editor paths
  must resolve inside the repo, while Git symlink content reads the link value without following it.
- Combined conflict patches never enter a unified parser.
- Command-menu search is bounded before cmdk sees file items.
- Session/preference errors preserve the last good content.
- Intentional lazy-request cancellation is explicit and diagnostics continue to reject all other
  network failures.
- Node 20 receives only the inert Navigator fields Pierre evaluates at import; newer runtimes and
  browsers retain their native Navigator.

No unresolved static or architectural defect remains in the bug-bash scope.
