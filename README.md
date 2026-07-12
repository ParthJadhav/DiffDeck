# Diffdeck

[![npm](https://img.shields.io/npm/v/@parthj/diffdeck.svg?label=npm&color=cb3837)](https://www.npmjs.com/package/@parthj/diffdeck)

Open a Git diff in your browser from the terminal.

<picture>
  <source srcset="docs/diffdeck-demo.gif" type="image/gif" />
  <img src="docs/diffdeck-infographic.png" alt="Diffdeck opens Git diffs in a local browser review workspace" />
</picture>

`diffdeck` starts a local web UI for the diff you ask Git for, then opens it in your browser. Use it when:

- You do not have a diff view where you are editing.
- `git diff` in the terminal is too hard to read.
- You are SSHed into a server and still want a clean visual review.

Optionally, you can comment on changed lines and copy all of them at once for your AI to resolve — the surrounding code context goes with them, so the agent has everything it needs to act.

## Agentic Setup

Tell your coding agent (Claude Code, Cursor, etc.):

```
Install `@parthj/diffdeck` globally with `npm install -g @parthj/diffdeck`, then add `alias gd='diffdeck'` to my shell rc file. Run `gd` whenever I ask you to show me a diff.
```

## Install

```sh
npm install -g @parthj/diffdeck
```

The package is scoped, but the installed command is `diffdeck`.

To update to the latest version:

```sh
npm install -g @parthj/diffdeck@latest
```

(`npm update -g` won't bump globally-installed packages because they're pinned to an exact version at install time.)

## Make It A Drop-In

Diffdeck accepts the same diff arguments, so the simplest setup is a shell alias:

```sh
alias gd='diffdeck'
```

Then use it like `git diff`:

```sh
gd
gd --cached
gd HEAD~1 HEAD
```

## Use It Like Git Diff

```sh
diffdeck
diffdeck --cached
diffdeck HEAD~1 HEAD
diffdeck -- -- '*.tsx'
```

Everything after Diffdeck's own options is passed through to `git diff` as long as it still produces plain patch output. Summary-only modes such as `--stat`, `--name-only`, `--raw`, and `--no-patch` are rejected because there is no file patch for the browser to render.

## Options

| Option | What it does |
| --- | --- |
| `--repo <path>` | Run against another repository. |
| `--port <number>` | Bind to a specific port. Defaults to `4321` (falls back to a free port if taken). |
| `--host <host>` | Bind to a host. Defaults to `127.0.0.1`. |
| `--no-open` | Start the server without opening a browser. |
| `--watch` | Watch the selected diff and notify the browser when it changes. |
| `--watch-interval <ms>` | Set the watch polling interval from 100 to 60,000 ms (default `750`). |
| `--editor <command>` | Enable “Open in editor” with the configured executable. |
| `--structural` | Enable opt-in Difftastic views when `difft` is installed. |
| `--write` | Enable confirmed stage, unstage, and revert controls. The default is read-only. |
| `--debug` | Print line-numbered parsing diagnostics. |
| `--version` | Print the installed version and exit. |
| `--help` | Show CLI help. |

## Requirements

- Node.js 20 or newer
- Git available on your `PATH`
- Optional: [Difftastic](https://difftastic.wilfred.me.uk/) available as `difft` for structural views

## Review workflow

Review state is stored locally in the browser per repository and normalized Git arguments. Viewed
files, collapsed files, filters, comment drafts, saved comments, and selection survive reloads. On
refresh, unchanged files keep their progress; changed files are reopened and their comments are
re-anchored, resolved, or marked stale.

Comments can be copied as a Markdown review packet, downloaded as versioned JSON, or sent to the
terminal that launched DiffDeck. Image changes support side-by-side, overlay, and swipe comparison.
Supported JavaScript manifests and lockfiles get a package-change summary with a source-diff
fallback.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `j` / `k` | Next / previous visible file |
| `v` | Toggle viewed for the selected file |
| `c` | Start a comment at the first changed line |
| `x` | Collapse or expand the selected file |
| `/` | Focus path filters |
| `s` | Open diff settings |
| `o` | Open the selected file in the configured editor |
| `?` or `Cmd/Ctrl+K` | Open the command palette and shortcut reference |

Shortcuts are suppressed while typing in an input, selection, or comment field.

## Security and repository writes

DiffDeck binds to loopback by default. When `--host` exposes it beyond loopback, the CLI generates a
random capability token, prints and opens the complete tokenized URL, and requires that token for
every API, event, image, editor, structural, terminal, and write request. Treat that URL as a secret:
anyone who has it can read the selected diff while the process is running.

Repository mutation controls do not exist unless DiffDeck starts with `--write`. Every action is
restricted to a path in the current snapshot; stale snapshots are rejected. Revert actions require
confirmation, and file or individual-hunk scope is shown before the action runs.

## Develop

```sh
bun install
bun run dev
bun run check
```

## Releases

See [GitHub Releases](https://github.com/ParthJadhav/DiffDeck/releases) for the full version history. Highlights:

- **0.3.8** — Refined the review UI with shared controls, icons, compact states, and better mobile diff layout.
- **0.3.7** — Browser page refreshes now reload the current git status instead of reusing a cached session.
- **0.2.0** — File-list virtualization for large diffs (23k+ files), survives non-ASCII patches, comment drafts persist across scroll.
- **0.1.3** — Float copy-comments FAB, render binary file placeholders, oklch theme tokens.
- **0.1.1** — Initial scoped npm release.

## License

MIT
