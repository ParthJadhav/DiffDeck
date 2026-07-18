import { describe, expect, test } from "bun:test";
import {
  buildDiffDeepLink,
  buildSelectedFileUrl,
  hasCapabilityToken,
  readDiffLocation,
} from "../src/client/lib/deepLink.js";

describe("diff deep links", () => {
  test("round trips encoded paths, lines, and sides", () => {
    const link = buildDiffDeepLink("http://127.0.0.1:4321/", "src/a # ?/日本語.ts", {
      line: 42,
      side: "additions",
    });
    expect(readDiffLocation(link)).toEqual({
      file: "src/a # ?/日本語.ts",
      line: 42,
      side: "additions",
    });
  });

  test("retains remote capability without exposing it through the file value", () => {
    const link = buildDiffDeepLink(
      "http://example.test/?token=secret&file=old.ts&line=9&side=deletions",
      "src/new.ts",
    );
    const url = new URL(link);
    expect(url.searchParams.get("token")).toBe("secret");
    expect(url.searchParams.get("file")).toBe("src/new.ts");
    expect(url.searchParams.has("line")).toBe(false);
    expect(url.searchParams.has("side")).toBe(false);
    expect(hasCapabilityToken(link)).toBe(true);
  });

  test("rejects invalid line and side values", () => {
    expect(readDiffLocation("http://example.test/?file=a.ts&line=-3&side=left")).toEqual({
      file: "a.ts",
      line: null,
      side: null,
    });
  });

  test("preserves a matching line target and clears stale targets on file changes", () => {
    const matching = buildSelectedFileUrl(
      "http://example.test/?token=secret&file=a.ts&line=12&side=deletions",
      "a.ts",
    );
    expect(readDiffLocation(matching)).toEqual({ file: "a.ts", line: 12, side: "deletions" });

    const changed = new URL(buildSelectedFileUrl(matching, "b.ts"));
    expect(changed.searchParams.get("token")).toBe("secret");
    expect(readDiffLocation(changed.toString())).toEqual({
      file: "b.ts",
      line: null,
      side: null,
    });

    const cleared = new URL(buildSelectedFileUrl(changed.toString(), null));
    expect(cleared.searchParams.get("token")).toBe("secret");
    expect(readDiffLocation(cleared.toString())).toEqual({ file: null, line: null, side: null });
  });
});
