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
  });

  test("produces versioned deterministic JSON", () => {
    const parsed = JSON.parse(formatReviewPacketJson(packet));
    expect(parsed).toMatchObject({
      version: 1,
      repository: { snapshotId: "abc" },
      progress: { viewedFiles: 1 },
    });
    expect(parsed.comments[0]).toMatchObject({ body: "Fix this", status: "open" });
  });
});
