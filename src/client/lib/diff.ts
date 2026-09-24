export function buildHeader(diffArgs: string[]): string {
  if (diffArgs.length === 0) {
    return "git diff";
  }
  return `git diff ${diffArgs.join(" ")}`;
}

/**
 * Plain-language scope for the common invocations, so `git diff` (unstaged)
 * is not mistaken for `git diff HEAD` (everything uncommitted). Anything
 * less common returns null rather than guessing.
 */
export function describeDiffScope(diffArgs: readonly string[]): string | null {
  const args = diffArgs.filter((arg) => arg !== "--");
  if (args.length === 0) return "unstaged changes";
  if (args.length === 1 && (args[0] === "--cached" || args[0] === "--staged")) {
    return "staged changes";
  }
  if (args.length === 1 && args[0] === "HEAD") return "all uncommitted changes";
  return null;
}
