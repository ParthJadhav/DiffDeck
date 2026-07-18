// @pierre/diffs 1.2.x evaluates a mobile-Safari check when its root module is
// imported. Node 20 has no global Navigator, so provide only the inert fields
// that check reads before loading the parser. Node 21+ and browsers keep their
// native implementation.
type NavigatorTarget = {
  navigator?: unknown;
};

export function ensureNodeNavigator(target: NavigatorTarget = globalThis): void {
  if (target.navigator == null) {
    Object.defineProperty(target, "navigator", {
      configurable: true,
      value: { maxTouchPoints: 0, platform: "", userAgent: "" },
    });
  }
}

ensureNodeNavigator();
