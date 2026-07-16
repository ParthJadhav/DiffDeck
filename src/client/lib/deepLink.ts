export interface DiffLocation {
  file: string | null;
  line: number | null;
  side: "additions" | "deletions" | null;
}

export function readDiffLocation(href: string): DiffLocation {
  const url = new URL(href);
  const lineValue = Number(url.searchParams.get("line"));
  const sideValue = url.searchParams.get("side");
  return {
    file: url.searchParams.get("file"),
    line: Number.isInteger(lineValue) && lineValue > 0 ? lineValue : null,
    side: sideValue === "additions" || sideValue === "deletions" ? sideValue : null,
  };
}

export function buildDiffDeepLink(
  href: string,
  file: string,
  location?: Pick<DiffLocation, "line" | "side">,
): string {
  const url = new URL(href);
  url.searchParams.set("file", file);
  if (location?.line != null && location.line > 0) {
    url.searchParams.set("line", String(Math.floor(location.line)));
  } else {
    url.searchParams.delete("line");
  }
  if (location?.side != null) url.searchParams.set("side", location.side);
  else url.searchParams.delete("side");
  url.hash = "";
  return url.toString();
}

export function buildSelectedFileUrl(href: string, selectedPath: string | null): string {
  const url = new URL(href);
  const currentPath = url.searchParams.get("file");
  if (selectedPath == null) {
    url.searchParams.delete("file");
    url.searchParams.delete("line");
    url.searchParams.delete("side");
  } else if (currentPath !== selectedPath) {
    url.searchParams.set("file", selectedPath);
    url.searchParams.delete("line");
    url.searchParams.delete("side");
  }
  return url.toString();
}

export function hasCapabilityToken(href: string): boolean {
  return new URL(href).searchParams.has("token");
}
