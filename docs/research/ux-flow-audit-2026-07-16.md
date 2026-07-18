# Whole-system UX audit — 2026-07-16

## Flow and hierarchy

The product's core object is a changed file; hunks, lines, and notes are subordinate. The initial
interface put navigation, settings, filters, progress, export, reset, and notes in one sidebar but
did not clearly distinguish their scope. The implementation pass establishes review-, file-,
change-, and handoff-level homes and one selected-file identity across URL, navigation, rich diff,
focus mode, and accessible patch.

## Findings before implementation

| Priority | Finding | User impact | Disposition |
| --- | --- | --- | --- |
| P0 | None reproduced | — | Continue security and mutation pass in bug bash. |
| P1 | Resizing desktop to 600 px could leave the virtualized patch blank. | Primary review surface unavailable until reload. | Narrow layout now swaps complete Files/Review places; tree beta.5 includes sticky virtualization fixes. Dynamic regression required. |
| P1 | Deep-linked lines raced virtualized mounting and could select/focus the wrong surface. | Shared location did not reliably open at its source. | Pinned visible-path ownership and bounded post-render focus retry; regression selectors added. |
| P1 | Global comment shortcut targeted hunk context instead of the first actual change. | A comment could attach to the wrong line. | Uses the first side-specific changed target; navigation regression covers selector. |
| P2 | Previous/next file was one misleading forward-only command. | Keyboard review direction and boundaries were unclear. | Four honest visible/unviewed actions with disabled boundaries and tests. |
| P2 | Native reset/revert confirmations conflicted with in-product confirmation. | Focus, copy, and risk signaling varied for destructive actions. | Shared modal confirmation with exact scope, Cancel focus, Escape, and trigger restoration. |
| P2 | Narrow screens permanently lost 28% of height to navigation. | Diff reading was cramped and orientation changes were fragile. | Explicit Files ↔ Review workspace under 1024 px; unified diff under 900 px. |
| P2 | Comment handoff was copy-first without exact preview. | Reviewers could not verify the delivered packet. | Exact Markdown/JSON preview while retaining one-click copy. |
| P2 | Whitespace preference could only be simulated visually. | Hidden churn would not be a truthful Git patch. | Server-owned fixed Git whitespace flags with safe refresh/reconciliation. |
| P3 | Global scrollbar styling and bordered cards with broad elevation added visual noise. | The dense surface felt more ornamental than instrumental. | System scrollbars and border-led file cards; elevation reserved for floating UI. |
| P3 | `Actions` did not identify the file-level scope. | Ambiguous control label. | Renamed `File operations`; destructive dialog names file/hunk. |

## Shipped hierarchy

- Sidebar top: identity, counts, refresh, tree/list, ordering, changed files.
- Sidebar lower: review progress, directional navigator/focus, notes, packet, filters, accessibility,
  diff settings, reset.
- File header: collapse/viewed, note, copy path/link, editor, structural/write operations.
- Patch: hunk expansion/navigation and line actions.
- Narrow layout: a 44 px landmark switches between the complete Files and Review places.

The detailed tokens, state behavior, contrast evidence, component vocabulary, and responsive rules
are in `DESIGN.md`. Bug findings and regression evidence continue in the bug-bash log rather than
being waived by this audit.
