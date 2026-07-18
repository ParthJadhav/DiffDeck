export interface VisiblePathCandidate {
  path: string;
  top: number;
}

export function chooseVisiblePath(
  candidates: readonly VisiblePathCandidate[],
  pinnedPath: string | null,
  aboveThreshold = 24,
): string | null {
  if (pinnedPath != null) {
    return candidates.some((candidate) => candidate.path === pinnedPath) ? pinnedPath : null;
  }
  let above: VisiblePathCandidate | null = null;
  let below: VisiblePathCandidate | null = null;
  for (const candidate of candidates) {
    if (candidate.top <= aboveThreshold) {
      if (above == null || candidate.top > above.top) above = candidate;
    } else if (below == null || candidate.top < below.top) {
      below = candidate;
    }
  }
  return (above ?? below)?.path ?? null;
}
