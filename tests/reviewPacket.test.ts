import { describe, expect, test } from "bun:test";
import {
  createReviewPacket,
  formatReviewPacketJson,
  formatReviewPacketMarkdown,
} from "../src/client/lib/reviewPacket.js";

describe("ReviewPacket", () => {
  const packet = createReviewPacket({
    comments: [
      {
        body: "  Fix this  ",
        contextLines: [{ content: "const value = 1;\n", lineNumber: 3, target: true }],
        filePath: "src/a.ts",
        id: "one",
        lineNumber: 3,
        side: "additions",
      },
      {
        body: "  Split this module  ",
        contextLines: [],
        filePath: "src/b.ts",
        id: "file-note",
        lineNumber: 0,
        scope: "file",
        side: "additions",
      },
    ],
    diffArgs: ["--cached"],
    repoRoot: "/repo",
    snapshotId: "abc",
    totalFiles: 2,
    viewedFiles: 1,
  });

  test("normalizes context without duplicate blank lines", () => {
    const markdown = formatReviewPacketMarkdown(packet);
    expect(markdown).toContain("> 3 | const value = 1;\n```");
    expect(markdown).not.toContain("const value = 1;\n\n```");
    expect(markdown).toContain("src/b.ts (file-level note)");
    expect(markdown).toContain("(file-level note; no individual line selected)");
  });

  test("produces versioned deterministic JSON", () => {
    const parsed = JSON.parse(formatReviewPacketJson(packet));
    expect(parsed).toMatchObject({
      version: 2,
      repository: { snapshotId: "abc" },
      progress: { viewedFiles: 1 },
    });
    expect(parsed.comments[0]).toMatchObject({ body: "Fix this", status: "open" });
    expect(parsed.comments[0].scope).toBe("line");
    expect(parsed.comments[1]).toMatchObject({
      body: "Split this module",
      scope: "file",
      status: "open",
    });
  });
});
