import { describe, expect, test } from "bun:test";
import { ensureNodeNavigator } from "../src/server/nodeCompat.js";

describe("Node compatibility", () => {
  test("installs only the inert Navigator fields Pierre reads", () => {
    const target: { navigator?: unknown } = {};

    ensureNodeNavigator(target);

    expect(target.navigator).toEqual({ maxTouchPoints: 0, platform: "", userAgent: "" });
    expect(Object.getOwnPropertyDescriptor(target, "navigator")?.configurable).toBe(true);
  });

  test("preserves an existing Navigator implementation", () => {
    const navigator = { maxTouchPoints: 5, platform: "browser", userAgent: "existing" };
    const target = { navigator };

    ensureNodeNavigator(target);

    expect(target.navigator).toBe(navigator);
  });
});
