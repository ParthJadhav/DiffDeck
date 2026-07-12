import { useMemo, useState } from "react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { Virtuoso } from "react-virtuoso";
import { summarizeDependencyDiff } from "../../lib/dependencyDiff.js";
import type { DependencyChange } from "../../lib/dependencyDiff.js";
import { Badge } from "../ui/badge.js";
import { Button } from "../ui/button.js";

export function DependencyDiff({
  fileDiff,
  header,
  source,
}: {
  fileDiff: FileDiffMetadata;
  header: React.ReactNode;
  source: React.ReactNode;
}) {
  const [showSource, setShowSource] = useState(false);
  const changes = useMemo(() => summarizeDependencyDiff(fileDiff), [fileDiff]);
  if (showSource) {
    return (
      <div>
        <div className="flex justify-end border-b border-border p-2">
          <Button variant="outline" onClick={() => setShowSource(false)} className="h-7 text-xs">
            Show package summary
          </Button>
        </div>
        {source}
      </div>
    );
  }
  return (
    <>
      {header}
      <section aria-label={`Dependency changes for ${fileDiff.name}`} className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">
            Dependency changes{" "}
            <span className="font-normal text-muted-foreground">({changes.length})</span>
          </p>
          <Button variant="outline" onClick={() => setShowSource(true)} className="h-7 text-xs">
            Show source diff
          </Button>
        </div>
        {changes.length === 0 ? (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            No package version changes could be extracted. Use the source diff for this file.
          </p>
        ) : (
          <Virtuoso
            aria-label="Dependency change list"
            data={changes}
            computeItemKey={(_index, change) => change.name}
            itemContent={(_index, change) => <DependencyChangeRow change={change} />}
            style={{ height: Math.min(560, Math.max(36, changes.length * 36)) }}
            className="overflow-hidden rounded-md border border-border"
          />
        )}
      </section>
    </>
  );
}

function DependencyChangeRow({ change }: { change: DependencyChange }) {
  return (
    <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0">
      <span className="truncate font-mono">{change.name}</span>
      <span className="font-mono text-muted-foreground">
        {change.oldVersion ?? "—"} → {change.newVersion ?? "—"}
      </span>
      <Badge
        variant={change.type === "removed" || change.type === "downgraded" ? "outline" : "success"}
      >
        {change.type}
      </Badge>
    </div>
  );
}
