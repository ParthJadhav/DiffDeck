export interface ReviewNavigation {
  nextPath: string | null;
  nextUnviewedPath: string | null;
  position: number;
  previousPath: string | null;
  previousUnviewedPath: string | null;
  total: number;
}

export function getReviewNavigation(
  files: readonly { path: string }[],
  selectedPath: string | null,
  viewedPaths: ReadonlySet<string>,
): ReviewNavigation {
  const selectedIndex = files.findIndex((file) => file.path === selectedPath);
  const previousPath = selectedIndex > 0 ? (files[selectedIndex - 1]?.path ?? null) : null;
  const nextPath =
    selectedIndex === -1 ? (files[0]?.path ?? null) : (files[selectedIndex + 1]?.path ?? null);

  return {
    nextPath,
    nextUnviewedPath: findUnviewedPath(files, viewedPaths, selectedIndex + 1, 1),
    position: selectedIndex === -1 ? 0 : selectedIndex + 1,
    previousPath,
    previousUnviewedPath: findUnviewedPath(files, viewedPaths, selectedIndex - 1, -1),
    total: files.length,
  };
}

function findUnviewedPath(
  files: readonly { path: string }[],
  viewedPaths: ReadonlySet<string>,
  start: number,
  direction: -1 | 1,
): string | null {
  for (let index = start; index >= 0 && index < files.length; index += direction) {
    const path = files[index]?.path;
    if (path != null && !viewedPaths.has(path)) return path;
  }
  return null;
}
