# Pierre dependency audit — 2026-07-16

## Decision

Upgrade `@pierre/diffs` from 1.1.20 to the current stable 1.2.12 and
`@pierre/trees` from 1.0.0-beta.3 to 1.0.0-beta.5. Do not adopt the 1.3 prerelease line.

The upgrade was accepted because both packages contain fixes that directly match DiffDeck's risk
profile, the full test/build suite remains green, and the initial client entry remains within the
goal's 10% gzip budget after the accessible patch is split into a lazy chunk.

## Sources and relevant changes

- [`@pierre/diffs` npm package](https://www.npmjs.com/package/%40pierre/diffs) identifies 1.2.12 as
  the current stable release.
- [Diffs 1.2.0 release](https://github.com/pierrecomputer/pierre/releases/tag/diffs-v1.2.0)
  introduced `CodeView`, configurable tokenization limits, scroll anchoring and virtualization
  work, and its migration notes.
- [Diffs 1.2.12 release](https://github.com/pierrecomputer/pierre/releases/tag/diffs-v1.2.12)
  includes line-number focus and merge-conflict action fixes. Intermediate 1.2 releases also fixed
  quoted headers, sticky layout, hunk expansion, virtualized keyboard focus, and worker render
  option updates—all relevant to DiffDeck's custom headers, expansion, workers, and deep links.
- The upstream `@pierre/trees` history between beta.3 and beta.5 includes Strict Mode lifecycle,
  virtualized sticky-row blanking, restored paths/scroll position, stale row subscription, and
  responsive rendering fixes. These directly address DiffDeck's dynamic-resize blank-pane seed.

## Migration and workaround disposition

| Area | Decision | Evidence |
| --- | --- | --- |
| Quoted Git paths | Keep the Git-header normalizer | 1.2.12 no longer throws for the adversarial fixture, but it still does not return every canonical decoded path. `tests/git.test.ts` proves the guard remains necessary. |
| Multi-file rendering | Keep `MultiFileScroller` | `CodeView` is promising, but DiffDeck currently owns per-file lazy fetch, review annotations, custom headers, and heavy-file states. Replacing that surface during this upgrade would mix a large migration with the QOL work. |
| Worker render options | Keep the synchronization hook | `WorkerPool.setRenderOptions` is now supported and the hook is the supported way to keep line diff options synchronized. |
| Tree lifecycle patches | Accept upstream fixes | Live tree/list selection, reload persistence, and resized rendering are rechecked after upgrading; no new local patch is needed. |
| 1.3 prerelease | Defer | The required fixes are available in stable 1.2.12. A prerelease adds avoidable migration variance. |

## Verification record

- Unit/integration: 80 tests passed, including path normalization, hunk navigation, deep links,
  review-session migration, whitespace modes, and server capabilities.
- Static checks: TypeScript and Oxlint passed with zero warnings.
- Production build: passed with the worker and accessible view emitted as separate chunks.
- Initial entry: baseline 230.52 kB / 69.43 kB gzip; accepted build 254.82 kB / 76.16 kB gzip,
  a 9.69% gzip increase. The accessible patch view is lazy-loaded rather than charged to entry.
- Required live checks: custom file headers, annotation creation/jump, hunk targeting, tree/list
  selection persistence, a heavy lockfile, and the accessible-to-rich review-note handoff.
- Packaging: the installed tarball passes under Node 20 and Node 24. A server-only compatibility
  shim supplies the inert Navigator fields evaluated by Pierre 1.2.x when Node 20 imports its root
  parser export.

## Revisit triggers

Reconsider `CodeView` when it supports DiffDeck's lazy per-file data boundary and comment lifecycle
without parallel stores. Re-audit `@pierre/trees` when it publishes a stable 1.0 release. Remove the
quoted-path normalizer only after the canonical adversarial path fixtures pass against the upstream
parser without preprocessing.
