import { useEffect, useMemo, useRef } from "react";
import { FileTree as TreeModel, prepareFileTreeInput, type GitStatusEntry } from "@pierre/trees";
import { buildGitStatus } from "../lib/diff.js";
import { fileTreeShapeOptions } from "../lib/constants.js";
import type { DiffFileSummary, SessionPayload } from "../types.js";

export interface UseDiffTreeOptions {
  session: SessionPayload | null;
  selectedPath: string | null;
  viewedPaths: ReadonlySet<string>;
  onSelectionChange: (path: string | null) => void;
}

export function useDiffTree({
  session,
  selectedPath,
  viewedPaths,
  onSelectionChange,
}: UseDiffTreeOptions): TreeModel {
  const fileSummaryRef = useRef(new Map<string, DiffFileSummary>());
  const viewedPathsRef = useRef<ReadonlySet<string>>(viewedPaths);
  const previousSelectedPathsRef = useRef<Set<string>>(new Set());
  const suppressSelectionFireRef = useRef(false);
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;

  const filePaths = useMemo(() => session?.files.map((file) => file.path) ?? [], [session]);

  const gitStatuses = useMemo<GitStatusEntry[]>(
    () => (session == null ? [] : buildGitStatus(session.files)),
    [session],
  );

  const preparedInput = useMemo(
    () => prepareFileTreeInput(filePaths, fileTreeShapeOptions),
    [filePaths],
  );

  useEffect(() => {
    fileSummaryRef.current = new Map((session?.files ?? []).map((file) => [file.path, file]));
  }, [session]);

  useEffect(() => {
    viewedPathsRef.current = viewedPaths;
  }, [viewedPaths]);

  const treeModelRef = useRef<TreeModel | null>(null);
  if (treeModelRef.current == null) {
    treeModelRef.current = new TreeModel({
      composition: {
        contextMenu: {
          buttonVisibility: "when-needed",
          enabled: true,
          triggerMode: "both",
        },
      },
      density: "compact",
      ...fileTreeShapeOptions,
      gitStatus: [],
      initialExpansion: "open",
      paths: [],
      renderRowDecoration: ({ item }) => {
        const summary = fileSummaryRef.current.get(item.path);
        if (summary == null) {
          return null;
        }

        if (viewedPathsRef.current.has(item.path)) {
          return {
            text: "viewed",
            title: "Marked as viewed",
          };
        }

        return null;
      },
      search: true,
      unsafeCSS: `
        [data-type='item'] {
          transition: background-color 120ms ease, color 120ms ease;
        }

        [data-type='item'][data-item-selected='true'] {
          border-radius: 6px;
        }

        [data-item-section='decoration'] {
          font-size: 11px;
          font-weight: 600;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true'] {
          display: inline-flex;
          min-width: 0;
          max-width: 100%;
          align-items: center;
          overflow: hidden;
          font-size: 0;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem] {
          display: none;
          min-width: 0;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-compact-segment] {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          font-size: var(--trees-font-size);
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-compact-segment] > * {
          display: none;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-compact-segment]::before {
          content: attr(data-diffdeck-prefix);
          flex: 0 0 auto;
          color: var(--trees-fg-muted);
          white-space: pre;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-compact-segment]::after {
          content: attr(data-diffdeck-label);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          direction: rtl;
          text-align: left;
          unicode-bidi: isolate;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-segment-role='root'],
        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-segment-role='parent'] {
          flex: 0 1 auto;
          max-width: 7rem;
        }

        [data-item-flattened-subitems][data-diffdeck-compact-path='true']
          > [data-item-flattened-subitem][data-diffdeck-segment-role='leaf'] {
          flex: 1 1 auto;
        }
      `,
      onSelectionChange: (selectedPaths) => {
        const previous = previousSelectedPathsRef.current;
        previousSelectedPathsRef.current = new Set(selectedPaths);
        if (suppressSelectionFireRef.current) {
          return;
        }
        const newlySelected = selectedPaths.find(
          (path) => !previous.has(path) && fileSummaryRef.current.has(path),
        );
        const next =
          newlySelected ?? selectedPaths.find((path) => fileSummaryRef.current.has(path));
        if (next != null) {
          onSelectionChangeRef.current(next);
        }
      },
    });
  }
  const treeModel = treeModelRef.current;

  useEffect(() => {
    treeModel.resetPaths(filePaths, { preparedInput });
    treeModel.setGitStatus(gitStatuses);
  }, [filePaths, gitStatuses, preparedInput, treeModel]);

  useEffect(() => {
    treeModel.setGitStatus(gitStatuses);
  }, [gitStatuses, treeModel, viewedPaths]);

  useEffect(() => {
    if (selectedPath == null) {
      return;
    }
    const previous = previousSelectedPathsRef.current;
    if (previous.size === 1 && previous.has(selectedPath)) {
      return;
    }
    suppressSelectionFireRef.current = true;
    previousSelectedPathsRef.current = new Set([selectedPath]);
    try {
      for (const path of previous) {
        if (path !== selectedPath) {
          treeModel.getItem(path)?.deselect();
        }
      }
      treeModel.getItem(selectedPath)?.select();
      treeModel.focusPath(selectedPath);
    } finally {
      queueMicrotask(() => {
        suppressSelectionFireRef.current = false;
      });
    }
  }, [selectedPath, treeModel]);

  useEffect(() => {
    return () => {
      treeModel.cleanUp();
      treeModelRef.current = null;
    };
  }, [treeModel]);

  return treeModel;
}
