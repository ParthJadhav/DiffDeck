# DiffDeck design system

DiffDeck is a quiet, dense code-review instrument. Code is the dominant surface; controls explain
state and then get out of the way. Alignment, predictable placement, system typography, restrained
borders, and direct language carry the hierarchy. Decorative gradients, glass, ornamental motion,
and dashboard-style metrics do not belong in the product.

## Information architecture

The interface has four action scopes:

1. **Review scope** — file filters, ordering, progress, notes queue, packet export, diff preferences,
   accessible mode, and reset live with file navigation.
2. **File scope** — viewed state, file note, copy path/link, editor launch, structural view, and
   explicitly enabled Git operations live in the file header.
3. **Change scope** — hunk navigation/expansion and line comment/link actions live at the patch.
4. **Handoff scope** — exact Markdown/JSON preview, clipboard, download, and terminal delivery live
   in the packet surface.

### Sidebar anatomy

The sidebar is ordered by how often a reviewer needs each part, top to bottom:

1. **Header** — repository name, the exact `git diff` command plus a plain-language scope for the
   common cases (`unstaged`, `staged`, `all uncommitted`), `n of N files viewed` with a progress
   bar that turns green at completion, and total `+/−`. Refresh, accessible view, and settings are
   icon actions here; reset lives at the bottom of settings because it is rare and destructive.
2. **Files | Notes tabs** — two places, not a stack. Files shows the visible count (`4/16` when
   filtered); Notes shows the note count and a warning dot when any note went stale.
3. **Files tab** — one search field (`/`) that only narrows the list (a finder), the tree/flat
   switch, and the filter button whose popover also holds review order. Active filters are stated
   under the toolbar with a one-click Clear, because they change the whole review.
4. **Notes tab** — the notes queue grouped by file in review order, status filter, re-review
   summary, exact packet preview, and Clear all.
5. **Footer** — the review navigator and, once notes exist, the handoff bar: Copy for agent,
   download JSON, send to terminal.

One selected path owns the tree/list selection, URL, visible file card, focus mode, and accessible
view. A filter may temporarily hide it; the app chooses the first remaining file and keeps the URL
truthful. Jumping to a hidden note clears filters with an explanatory toast.

The normal journey is: orient in Files → navigate files or hunks → inspect/comment → mark viewed →
review the notes queue → preview and hand off the packet. Completion is stated as `n/n` viewed;
disabled previous/next controls make boundaries explicit instead of wrapping unexpectedly.

## Layout

- **≥1024 px:** resizable files/review sidebar and diff workspace. The panel ratio is persisted;
  files are constrained to 12–45% and the patch retains at least 30%.
- **<1024 px:** Files and Review are two explicit places selected from a 44 px navigation bar.
  Picking another file returns to Review. This avoids permanently consuming patch height.
- **<900 px:** rich diffs use unified layout. Users can still choose the linear accessible patch.
- The application viewport never scrolls horizontally. Code surfaces may scroll internally when
  the user selects overflow scrolling.
- Minimum verification widths: 320, 375, 600, 768, 1024, 1280, and 1440 px, plus 200% zoom.

## Color

All shipped roles are OKLCH triples in `src/client/styles.css`. Neutral roles use very low chroma;
status roles carry enough chroma to scan without relying on color alone. Text labels, icons, Git
letters, plus/minus signs, and accessible announcements duplicate every color meaning.

| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Background | `0.987 0.001 286.378` | `0.166 0.006 264.385` | App canvas |
| Foreground | `0.164 0.006 285.677` | `0.969 0.005 264.52` | Primary text |
| Muted foreground | `0.481 0.012 285.928` | `0.824 0.009 264.515` | Secondary text |
| Border | `0.903 0.005 286.3` | `0.275 0.01 264.403` | Structural separation |
| Info | `0.548 0.131 245.136` | `0.74 0.117 240.131` | Selection/current state |
| Destructive | `0.56 0.208 25.326` | `0.56 0.198 25.515` | Irreversible action/error |
| Added | `0.48 0.147 149.818` | `0.766 0.172 151.92` | Addition status/text |
| Deleted | `0.54 0.214 27.166` | `0.794 0.104 19.622` | Deletion status/text |
| Modified | `0.53 0.228 260.851` | `0.787 0.1 259.714` | Modified status |
| Renamed | `0.56 0.125 71.469` | `0.809 0.15 76.611` | Rename status |

WCAG contrast is calculated after OKLCH → linear sRGB conversion and gamut clipping:

| Pair | Light | Dark |
| --- | ---: | ---: |
| Foreground / background | 18.60:1 | 17.59:1 |
| Muted foreground / background | 6.29:1 | 11.17:1 |
| Primary text/background | 17.08:1 | 17.59:1 |
| Destructive foreground/background | 4.99:1 | 4.93:1 |
| Info foreground/muted surface | 6.42:1 | 9.32:1 |
| Warning foreground/muted surface | 5.19:1 | 9.33:1 |
| Added status / app background | 5.81:1 | 9.79:1 |
| Deleted status / app background | 5.44:1 | 9.67:1 |

Borders are not used as text. Focus uses a two-pixel ring plus shape/state. Forced-colors mode may
replace authored colors; native controls, borders, text labels, and focus outlines must remain.

## Type and density

- UI: Inter when available, then the platform system stack.
- Code/path/numeric state: platform monospace stack with tabular numbers; ligatures disabled for
  code-like content.
- Core controls use 11–14 px text at normal browser zoom; body/error copy is 12–14 px. Tiny 10–11 px
  labels are supplemental and never the only path to an action.
- Line height is compact but never clipped. Headings use balanced wrapping; body text uses pretty
  wrapping. Paths truncate visually while preserving the full accessible label/title.

Spacing follows a four-pixel base: 4, 8, 12, 16, 20, 24, and 32 px. Common radii are 4, 6, 8, and
12 px. Cards use borders without decorative elevation. Elevation is reserved for popovers, dialogs,
and the selected-file focus halo. Z-index roles are patch (0), sticky file header (5), popover (50),
annotation composer (80), and modal confirmation (top layer).

## Components and states

- **Buttons:** precise verb labels, visible focus ring, pressed scale only for direct manipulation,
  disabled opacity plus native disabled semantics. Icon-only controls require an accessible name and
  tooltip/title. Destructive buttons use the destructive role only at the final action.
- **Inputs/selects/checkboxes/toggles:** persistent label, border and ring focus, native semantics,
  disabled cursor/state, and no placeholder-only labels.
- **Tree/list:** one virtualized component for both modes; 28 px rows. Tree mode compresses
  single-child folder chains and shows `viewed/total` per folder (a check when done); flat mode
  shows the folder after the name. Each file row carries the Git status letter, name, note count,
  `+/−`, and a viewed ring that toggles in place without changing selection. Viewed rows dim.
  The list is one Tab stop (roving focus): arrows, Home/End, Left/Right to fold or reach the
  parent. The current file is always revealed, including inside collapsed folders.
- **Menus/popovers:** anchored, non-modal, Escape/outside-click dismissible, and focus restored to the
  trigger. Settings and filters describe scope in their title.
- **Dialogs:** reserved for destructive confirmation or focused editing. Destructive dialogs name
  the exact scope, state what is and is not affected, focus Cancel by default, trap background
  interaction through native `showModal()`, honor Escape, and restore the trigger.
- **Toasts/live regions:** routine success is brief and quiet; failure says what happened. A control
  never claims clipboard/editor/terminal success before the operation resolves.
- **Skeleton/empty/error:** reserve space, state the affected scope, and provide a retry or next step
  when one exists. `Nothing to diff` and `No files match` are never conflated.
- **Review notes:** open, stale, and resolved are textually named. Stale notes can be edited/reopened;
  resolved notes retain context. Jump focuses the source annotation.

## Keyboard ownership

One policy, implemented once in `src/client/lib/keyboard.ts` and used by every key handler:

1. **Text entry wins.** Focus in an input, textarea, select, or contenteditable — including inside
   open shadow roots — means every key is typing. No single-key shortcut fires, and nothing may
   move focus out of a text field programmatically (deep-link landing, re-renders, refreshes).
2. **Overlays own the keyboard.** A modal dialog, or focus inside a popover, menu, or the command
   palette, silences single-key shortcuts until it closes. `Esc` is the universal exit.
3. **Otherwise shortcuts run.** Single letters step and toggle; `Cmd/Ctrl+K` and `?` open the
   palette. Auto-repeat only steps (`j`/`k`/`n`/`p`), never toggles. IME composition keystrokes are
   never shortcuts.

Every composer shows how to hand the keyboard back — `Cmd/Ctrl+Enter` to finish, `Esc` to leave
with the draft intact — and focus lands on the note afterwards, not on `<body>`. Editing places the
caret at the end of existing text. Check a new key handler against `e2e/keyboard.e2e.ts`, which
types character by character into every text surface and asserts nothing else moved.

## State language

| Situation | Message pattern | Recovery |
| --- | --- | --- |
| App/session load | `Loading diff session…` | Stable shell space |
| Empty Git diff | `Nothing to diff` + explanation | Refresh or change Git arguments externally |
| Filters empty | `No files match` | Clear/adjust active filters |
| File fetch fails | `Could not load this file` + server reason | Retry file |
| Heavy patch | Honest row cap/collapsed explanation | Expand or use bounded view |
| Binary/conflict | Name unsupported representation | Use image/conflict state or editor |
| Stale snapshot | Say source changed before mutation | Reload and review current patch |
| Clipboard/editor/terminal fails | Name failed operation | Retry; packet preview remains available |
| Destructive action | Exact file/hunk and consequence | Cancel default; confirm explicitly |

## Motion and performance

Motion is 100–180 ms for anchored popovers, confirmation entry, selection, and compact status
changes. Review content is visible by default. `prefers-reduced-motion` reduces all durations to a
near-zero value and disables transforms/scroll smoothing. Skeletons reserve asynchronous diff
space. Heavy files and offscreen files remain lazy; the accessible view is a separate client chunk.

The initial entry gzip budget is the recorded baseline plus at most 10% unless an exception is
measured and documented. System scrollbars are used; global decorative scrollbar styling is not.
