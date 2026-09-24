import type { DiffFileSummary } from "../types.js";

export interface DirectoryRow {
  kind: "directory";
  /** Full path of the deepest folder in a compressed chain; stable collapse key. */
  id: string;
  /** Display label; single-child folder chains are joined, e.g. `src/components`. */
  label: string;
  depth: number;
  fileCount: number;
  viewedCount: number;
  collapsed: boolean;
}

export interface FileRow {
  kind: "file";
  file: DiffFileSummary;
  depth: number;
}

export type FileListRow = DirectoryRow | FileRow;

interface DirectoryNode {
  name: string;
  path: string;
  entries: Array<DirectoryNode | DiffFileSummary>;
  children: Map<string, DirectoryNode>;
  fileCount: number;
  viewedCount: number;
}

/**
 * Rows for the hierarchical file list. `files` must already be in tree path
 * order (see `orderDiffFiles(files, "path")`), which keeps the visual order
 * identical to `j`/`k` stepping when the review is ordered by path.
 */
export function buildTreeRows(
  files: readonly DiffFileSummary[],
  collapsed: ReadonlySet<string>,
  viewedPaths: ReadonlySet<string>,
): FileListRow[] {
  const root = createNode("", "");
  for (const file of files) {
    const segments = file.path.split("/");
    let node = root;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const name = segments[index]!;
      let child = node.children.get(name);
      if (child == null) {
        child = createNode(name, node.path === "" ? name : `${node.path}/${name}`);
        node.children.set(name, child);
        node.entries.push(child);
      }
      node = child;
    }
    node.entries.push(file);
  }
  countFiles(root, viewedPaths);

  const rows: FileListRow[] = [];
  const visit = (node: DirectoryNode, depth: number) => {
    for (const entry of node.entries) {
      if (!isDirectory(entry)) {
        rows.push({ depth, file: entry, kind: "file" });
        continue;
      }
      let directory = entry;
      let label = directory.name;
      while (directory.entries.length === 1 && isDirectory(directory.entries[0]!)) {
        directory = directory.entries[0] as DirectoryNode;
        label += `/${directory.name}`;
      }
      const isCollapsed = collapsed.has(directory.path);
      rows.push({
        collapsed: isCollapsed,
        depth,
        fileCount: directory.fileCount,
        id: directory.path,
        kind: "directory",
        label,
        viewedCount: directory.viewedCount,
      });
      if (!isCollapsed) visit(directory, depth + 1);
    }
  };
  visit(root, 0);
  return rows;
}

export function buildFlatRows(files: readonly DiffFileSummary[]): FileListRow[] {
  return files.map((file) => ({ depth: 0, file, kind: "file" }));
}

/** Case-insensitive substring match on the full path, matching the palette. */
export function searchFiles(
  files: readonly DiffFileSummary[],
  query: string,
): readonly DiffFileSummary[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return files;
  return files.filter((file) => file.path.toLocaleLowerCase().includes(normalized));
}

/** Collapsed folders that hide `path`; expanding them reveals the file. */
export function collapsedAncestors(collapsed: ReadonlySet<string>, path: string): string[] {
  const ancestors: string[] = [];
  for (const id of collapsed) {
    if (path.startsWith(`${id}/`)) ancestors.push(id);
  }
  return ancestors;
}

export function splitPath(path: string): { basename: string; directory: string } {
  const separator = path.lastIndexOf("/");
  return separator === -1
    ? { basename: path, directory: "" }
    : { basename: path.slice(separator + 1), directory: path.slice(0, separator) };
}

/** Compact line counts so the stat column never pushes names out: 1.2k, 12k. */
export function formatLineCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10_000) return `${(Math.floor(value / 100) / 10).toString()}k`;
  return `${Math.floor(value / 1000)}k`;
}

function createNode(name: string, path: string): DirectoryNode {
  return { children: new Map(), entries: [], fileCount: 0, name, path, viewedCount: 0 };
}

function isDirectory(entry: DirectoryNode | DiffFileSummary): entry is DirectoryNode {
  return "entries" in entry;
}

function countFiles(node: DirectoryNode, viewedPaths: ReadonlySet<string>) {
  let fileCount = 0;
  let viewedCount = 0;
  for (const entry of node.entries) {
    if (isDirectory(entry)) {
      countFiles(entry, viewedPaths);
      fileCount += entry.fileCount;
      viewedCount += entry.viewedCount;
    } else {
      fileCount += 1;
      if (viewedPaths.has(entry.path)) viewedCount += 1;
    }
  }
  node.fileCount = fileCount;
  node.viewedCount = viewedCount;
}
