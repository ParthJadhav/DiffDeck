export const diffWhitespaceModes = [
  "normal",
  "ignore-eol",
  "ignore-space-change",
  "ignore-all",
  "ignore-blank-lines",
] as const;

export type DiffWhitespaceMode = (typeof diffWhitespaceModes)[number];

const whitespaceFlags: Record<DiffWhitespaceMode, string[]> = {
  normal: [],
  "ignore-eol": ["--ignore-space-at-eol"],
  "ignore-space-change": ["--ignore-space-change"],
  "ignore-all": ["--ignore-all-space"],
  "ignore-blank-lines": ["--ignore-blank-lines"],
};

export function isDiffWhitespaceMode(value: unknown): value is DiffWhitespaceMode {
  return typeof value === "string" && diffWhitespaceModes.includes(value as DiffWhitespaceMode);
}

export function withWhitespaceMode(
  diffArgs: readonly string[],
  mode: DiffWhitespaceMode,
): string[] {
  return [...whitespaceFlags[mode], ...diffArgs];
}
