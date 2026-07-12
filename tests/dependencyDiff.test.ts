import { describe, expect, test } from "bun:test";
import type { FileDiffMetadata } from "@pierre/diffs";
import { summarizeDependencyDiff } from "../src/client/lib/dependencyDiff.js";

describe("dependency summaries", () => {
  test("classifies manifest additions, removals, upgrades, and downgrades", () => {
    const result = summarizeDependencyDiff(
      diff(
        "package.json",
        ['{"dependencies":{"old":"2.0.0","removed":"1.0.0","down":"3.0.0"}}'],
        ['{"dependencies":{"old":"2.1.0","added":"1.0.0","down":"2.0.0"}}'],
      ),
    );
    expect(result).toEqual([
      { name: "added", newVersion: "1.0.0", type: "added" },
      { name: "down", oldVersion: "3.0.0", newVersion: "2.0.0", type: "downgraded" },
      { name: "old", oldVersion: "2.0.0", newVersion: "2.1.0", type: "upgraded" },
      { name: "removed", oldVersion: "1.0.0", type: "removed" },
    ]);
  });

  test("falls back without throwing for malformed files", () => {
    expect(summarizeDependencyDiff(diff("package.json", ["{"], ["not json"]))).toEqual([]);
  });
});

function diff(name: string, deletionLines: string[], additionLines: string[]): FileDiffMetadata {
  return {
    name,
    type: "change",
    hunks: [],
    deletionLines,
    additionLines,
    isPartial: false,
  } as FileDiffMetadata;
}
