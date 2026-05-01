import { createHash } from "node:crypto";

export function buildCacheKey(scope: string, identifier: string, contents: string): string {
  const digest = createHash("sha256").update(contents).digest("hex").slice(0, 16);
  return `cli-diff:${scope}:${identifier}:${digest}`;
}
