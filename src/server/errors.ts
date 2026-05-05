export class DiffdeckError extends Error {
  readonly details: string[];

  constructor(message: string, details: string[] = [], cause?: unknown) {
    super(message, { cause });
    this.name = "DiffdeckError";
    this.details = details;
  }
}

function isErrorLike(error: unknown): error is Error & { cause?: unknown } {
  return error instanceof Error;
}

function getCause(error: unknown): unknown {
  return isErrorLike(error) ? error.cause : undefined;
}

export function formatCliError(error: unknown, debug = false): string {
  const message = isErrorLike(error) ? error.message : String(error);
  const lines = [`diffdeck failed: ${message}`];

  if (error instanceof DiffdeckError && error.details.length > 0) {
    lines.push("", "Context:");
    for (const detail of error.details) {
      lines.push(`  ${detail}`);
    }
  }

  const cause = getCause(error);
  if (cause != null) {
    const causeMessage = isErrorLike(cause) ? `${cause.name}: ${cause.message}` : String(cause);
    lines.push("", `Cause: ${causeMessage}`);
  }

  if (debug && isErrorLike(error) && error.stack != null) {
    lines.push("", "Stack:", error.stack);
  }

  return lines.join("\n");
}
