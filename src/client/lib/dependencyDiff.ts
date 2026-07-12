import type { FileDiffMetadata } from "@pierre/diffs";

export interface DependencyChange {
  name: string;
  oldVersion?: string;
  newVersion?: string;
  type: "added" | "removed" | "upgraded" | "downgraded" | "changed";
}

export function summarizeDependencyDiff(fileDiff: FileDiffMetadata): DependencyChange[] {
  const oldPackages = parsePackages(fileDiff.name, fileDiff.deletionLines);
  const newPackages = parsePackages(fileDiff.name, fileDiff.additionLines);
  const names = sortedStrings(new Set([...oldPackages.keys(), ...newPackages.keys()]));
  const changes: DependencyChange[] = [];
  for (const name of names) {
    const oldVersion = oldPackages.get(name);
    const newVersion = newPackages.get(name);
    if (oldVersion === newVersion) continue;
    let type: DependencyChange["type"];
    if (oldVersion == null) type = "added";
    else if (newVersion == null) type = "removed";
    else {
      const comparison = compareVersions(oldVersion, newVersion);
      type = comparison < 0 ? "upgraded" : comparison > 0 ? "downgraded" : "changed";
    }
    changes.push({ name, oldVersion, newVersion, type });
  }
  return changes;
}

function sortedStrings(values: Iterable<string>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const index = result.findIndex((current) => current.localeCompare(value) > 0);
    if (index === -1) result.push(value);
    else result.splice(index, 0, value);
  }
  return result;
}

function parsePackages(path: string, sourceLines: readonly string[]): Map<string, string> {
  const lines = sourceLines.map(normalizeLine);
  if (path.endsWith("package.json")) {
    try {
      const value = JSON.parse(lines.join("\n")) as Record<string, unknown>;
      const result = new Map<string, string>();
      for (const section of [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ]) {
        const dependencies = value[section];
        if (dependencies == null || typeof dependencies !== "object" || Array.isArray(dependencies))
          continue;
        for (const [name, version] of Object.entries(dependencies)) {
          if (typeof version === "string") result.set(name, version);
        }
      }
      return result;
    } catch {
      // Partial manifests fall through to the tolerant line parser.
    }
  }
  const result = new Map<string, string>();
  for (const line of lines) {
    const json = line.match(/^\s*["']?(@?[^"':\s]+(?:\/[^"':\s]+)?)["']?\s*:\s*["']([^"']+)["']/);
    if (json != null) {
      result.set(json[1]!, json[2]!);
      continue;
    }
    const yarn = line.match(/^\s*["']?(@?[^@"':\s]+(?:\/[^@"':\s]+)?)@[^:]+:["']?\s*$/);
    const version = yarn == null ? null : findNearbyVersion(lines, line);
    if (yarn != null && version != null) result.set(yarn[1]!, version);
  }
  return result;
}

function findNearbyVersion(lines: string[], current: string): string | null {
  const index = lines.indexOf(current);
  for (let offset = 1; offset <= 4; offset += 1) {
    const match = lines[index + offset]?.match(/^\s*version\s+["']([^"']+)/);
    if (match != null) return match[1]!;
  }
  return null;
}

function normalizeLine(line: string): string {
  return line.replace(/\r?\n$/, "").replace(/^[+-](?=\s|["'])/, "");
}

function compareVersions(a: string, b: string): number {
  const clean = (value: string) =>
    value
      .replace(/^[^0-9]*/, "")
      .split(/[.-]/)
      .map(Number);
  const left = clean(a);
  const right = clean(b);
  if (left.some(Number.isNaN) || right.some(Number.isNaN)) return 0;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}
