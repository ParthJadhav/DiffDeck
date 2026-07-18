# DiffDeck Next Improvement Program

Status: complete — verified 2026-07-16
Baseline: `v0.4.1` / `4296d6b` on 2026-07-16

## Program Objective

Make DiffDeck meaningfully faster and more trustworthy for repeated local code review by completing
three separate, evidence-backed goals:

1. [QOL features](./01-qol-features.md)
2. [Whole-system UX and UI](./02-system-ux-ui.md)
3. [Exhaustive bug bash](./03-bug-bash.md)

The earlier [complete improvement plan](../IMPLEMENTATION_PLAN.md) is historical delivery evidence
for v0.4.x. Its requirements are already shipped and must not be copied into this backlog as new
work. This program starts from the product that exists now.

## Research Baseline

### Repository and architecture

- The current product already has durable browser review sessions, re-review reconciliation,
  comments and agent packets, filters, keyboard shortcuts, image and dependency views, watch mode,
  remote capability tokens, optional structural diffs, and gated write actions.
- The main architectural seams are `ReviewSession`, `DiffSource`, and `ReviewPacket`. New behavior
  should extend those seams instead of adding stateful one-off code in components or routes.
- The largest first-party files are currently `src/server/git.ts` (803 lines),
  `src/client/styles.css` (879), `src/client/components/DiffWorkspace.tsx` (788),
  `src/server/server.ts` (568), and `src/client/App.tsx` (523). Work in these files needs an explicit
  decomposition check; growth without stronger boundaries is not acceptable.
- The app already uses the preferred libraries for the relevant established primitives: `cmdk`,
  `react-virtuoso`, and Sonner. Continue using them rather than creating replacement command menus,
  virtualized collections, or toast systems.

### Quality baseline

- `bun run check` passes: type checks, lint, format check, 33 tests, and both production builds.
- `bun test --coverage` reports about 72% line and function coverage for the modules it reaches.
  Client components are largely absent from that report, so the number overstates confidence in
  the complete user experience.
- There is no committed end-to-end browser suite. The prior plan records thorough manual Chrome
  verification, but those flows are not automatically guarded against regressions.
- The production entry is about 213 kB minified / 65 kB gzip. Large syntax grammar chunks are lazy
  and documented in `vite.config.ts`; future changes must preserve intentional chunking.
- The public GitHub repository had no open or closed issues at research time. That is not evidence
  of zero defects; it increases the importance of systematic local discovery.

### Live UI inspection

- The 10-file fake repository rendered with no console warnings or errors at the desktop viewport.
- The interface is appropriately dense, but file navigation, diff navigation, comments, settings,
  and mutation actions are distributed across several surfaces with no single review-oriented
  hierarchy.
- Changing the live viewport from desktop to 600 px once produced an empty lower diff pane until a
  reload. Treat this as a bug-bash seed and reproduce it before deciding the fix.
- The command palette item labeled “Next / previous file” performs only the next-file action. This
  is a confirmed label/action mismatch and a seed defect.
- Several destructive paths use native `window.confirm`, while other destructive actions use an
  in-product two-step confirmation. The system needs one predictable confirmation vocabulary.

## External Product Research

The feature and UX goals were informed by official documentation, not by copying another product's
visual style:

- [GitHub pull-request review](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests): file filtering and trees, symbol-oriented navigation,
  consolidated review comments, and dependency review.
- [GitLab merge-request changes](https://docs.gitlab.com/user/project/merge_requests/changes/):
  tree/list choices, file-level comments, copyable file paths and links, one-file mode, generated
  file collapse, whitespace preferences, and durable viewed state.
- [VS Code diff review](https://code.visualstudio.com/docs/sourcecontrol/staging-commits): next and
  previous change navigation, inline versus side-by-side modes, selected-range actions, and an
  accessible unified-patch view.
- [Git diff options](https://git-scm.com/docs/git-diff): authoritative whitespace modes and their
  semantics.
- [WAI ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/): landmark, widget, and keyboard
  interaction guidance.
- [`@pierre/diffs` documentation](https://diffs.com/docs): supported rendering, annotation,
  selection, and virtualization primitives. The installed version is `1.1.20`; any upgrade must be
  based on upstream release notes and a compatibility pass rather than version chasing.

## Product Guardrails

- Keep DiffDeck local, private, fast, terminal-adjacent, and read-only by default.
- Do not turn it into a hosted collaboration product, repository browser, merge-request host, or
  generic Git GUI.
- Every repository mutation remains absent unless `--write` is supplied, is scoped to the current
  snapshot, and has clear confirmation and recovery behavior.
- Optional executables and integrations remain capability-detected and degrade cleanly.
- Preserve compactness, but never at the expense of readable text, visible focus, keyboard access,
  honest labels, touch access, or WCAG AA contrast.
- Prefer familiar product affordances and shared primitives over novelty.
- Preserve user review data across schema changes through explicit versioned migration tests.
- Do not knowingly ship a feature or visual refinement with an open regression.

## Execution Order

The goals are distinct but share one program:

1. Re-run the baseline and reproduce the two seed defects.
2. Complete QOL features as vertical slices, applying the UX rules from Goal 2 while building.
3. Run the whole-system UX/UI pass after the new features have put the final pressure on layout and
   information architecture.
4. Execute the independent bug bash across the combined result. Fix every discovered defect and
   add the smallest durable regression test that would have caught it.
5. Re-run the full release, packaging, browser, accessibility, security, and performance evidence.

Goal 3 is the final release gate. Completing Goals 1 or 2 does not permit marking the overall
program complete.

## Program Definition of Done

The program is complete only when all three linked goal documents meet their own definitions of
done and all of the following are true:

- Every required feature has shipped through a tested production path and is documented.
- The complete UI has been evaluated as one system in all supported states and breakpoints.
- The final bug-bash log contains no open discovered defects at any severity.
- `bun run check`, coverage gates, browser tests, production packaging, and an installed-tarball
  smoke test all pass from a clean checkout.
- Browser console, network, accessibility, responsive, security, and performance checks have no
  unexplained failures.
- README, CLI help, API behavior, shortcuts, screenshots, and package metadata match the shipped
  result.

## Completion record

- Goal 1: complete; F1–F6 ship and are covered by unit, browser, packaging, and dependency-audit
  evidence.
- Goal 2: complete; `DESIGN.md`, the UX audit, seven visual baselines, responsive/accessibility
  tests, and the state matrix describe and guard the complete interface.
- Goal 3: complete; all P1–P7 passes are recorded and the bug log contains zero open P0–P3
  findings.
- Evidence: [release verification](../RELEASE_VERIFICATION_2026-07-16.md),
  [bug-bash log](../BUG_BASH_2026-07-16.md), and [release notes](../RELEASE_NOTES.md).
