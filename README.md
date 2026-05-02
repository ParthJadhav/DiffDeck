# Diffdeck

Open a Git diff in your browser from the terminal.

`diffdeck` starts a local web UI for the diff you ask Git for, then opens it in your browser. It is useful when a terminal diff is too cramped but you still want to stay close to the command line.

## Install

```sh
npm install -g @parthjadhav/diffdeck
```

The npm package is scoped, but the installed command is `diffdeck`.

## Usage

```sh
diffdeck [options] [git diff args...]
```

Examples:

```sh
diffdeck
diffdeck --cached
diffdeck HEAD~1 HEAD
diffdeck --repo ../my-repo -- -- '*.ts'
```

By default, `diffdeck` runs against the current Git repository and opens a browser tab automatically.

## Options

```text
--repo <path>     Repository path. Defaults to the current working directory.
--port <number>   Port to bind. Defaults to 0 (pick a free port).
--host <host>     Host to bind. Defaults to 127.0.0.1.
--no-open         Do not open the browser automatically.
--help            Show this help message.
```

Everything that is not a `diffdeck` option is passed through as a `git diff` argument.

Use `--` before pathspecs or arguments that should be reserved for Git:

```sh
diffdeck -- -- '*.tsx'
```

## Requirements

- Node.js 20 or newer
- Git available on your `PATH`

## Development

```sh
bun install
bun run dev
```

Build and validate the package:

```sh
bun run check
npm run pack:dry-run
```

## Publishing

The package is prepared for npm but is not published yet. It uses `@parthjadhav/diffdeck` while keeping the binary name `diffdeck`.

```sh
bun run check
npm login
npm publish
```

`prepack` builds the production assets before `npm pack` or `npm publish`.

## License

MIT
