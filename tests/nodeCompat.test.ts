import { describe, expect, test } from "bun:test";
import { ensureNodeNavigator } from "../src/server/nodeCompat.js";

describe("Node compatibility", () => {
  test("preserves an existing Navigator implementation", () => {
    const navigator = { maxTouchPoints: 5, platform: "browser", userAgent: "existing" };
    const target = { navigator };

    ensureNodeNavigator(target);

    expect(target.navigator).toBe(navigator);
  });
});
