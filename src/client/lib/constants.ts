export const themeOptions = {
  dark: "pierre-dark",
  light: "pierre-light",
} as const;

export const highlighterLangs = [
  "typescript",
  "tsx",
  "javascript",
  "jsx",
  "json",
  "yaml",
  "css",
  "html",
  "markdown",
] as const;

export const virtualizerConfig = {
  intersectionObserverMargin: 4000,
  overscrollSize: 1200,
  resizeDebugging: false,
} as const;

export const diffViews = ["file", "snippet", "patch"] as const;
export const themeChoices = ["system", "light", "dark"] as const;
export const diffLayouts = ["split", "unified"] as const;
export const diffIndicatorModes = ["bars", "classic", "none"] as const;
export const diffLineModes = ["word", "word-alt", "char", "none"] as const;
export const hunkSeparatorModes = [
  "line-info",
  "line-info-basic",
  "metadata",
  "simple",
  "custom",
] as const;
export const overflowModes = ["scroll", "wrap"] as const;

export const diffIndicatorLabels = {
  bars: "Bars",
  classic: "Classic +/-",
  none: "None",
} as const;

export const hunkSeparatorLabels = {
  "line-info": "Line Info",
  "line-info-basic": "Line Info Basic",
  metadata: "Metadata",
  simple: "Simple",
  custom: "Custom CSS",
} as const;

export const customHunkSeparatorCSS = `
[data-separator="line-info-basic"] {
  height: 24px;
  background: var(--diffs-bg);
  position: relative;
}

[data-diff-type="single"] [data-gutter] [data-separator-wrapper],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-wrapper] {
  position: absolute;
  left: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  width: max-content;
  margin-left: calc(-2ch - 2px);
  background: transparent;
  color: var(--diffs-fg-number);
  font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));
  font-size: 0.75rem;
}

[data-separator="line-info-basic"] [data-separator-content] {
  text-transform: lowercase;
}

[data-diff-type="single"] [data-gutter] [data-separator-wrapper][data-separator-multi-button],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-wrapper][data-separator-multi-button] {
  display: flex;
  grid-template-columns: none;
  grid-template-rows: none;
  margin-left: calc(-3ch - 2px);
}

[data-diff-type="single"] [data-gutter] [data-expand-button],
[data-diff-type="single"] [data-gutter] [data-separator-content],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-button],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-content] {
  display: inline-grid;
  place-items: center;
  align-self: unset;
  min-width: unset;
  min-height: unset;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid color-mix(in lab, var(--diffs-fg-number) 32%, transparent);
  border-radius: 5px;
  background: var(--diffs-bg);
  color: inherit;
  font: inherit;
  line-height: 1;
  flex: 0 0 auto;
}

[data-diff-type="single"] [data-gutter] [data-expand-down]::before,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-down]::before {
  content: "↓";
}

[data-diff-type="single"] [data-gutter] [data-expand-up]::before,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-up]::before {
  content: "↑";
}

[data-diff-type="single"] [data-gutter] [data-expand-both]::before,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-both]::before {
  content: "↕";
}

[data-diff-type="single"] [data-gutter] [data-expand-button] svg,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-button] svg {
  display: none;
}

[data-diff-type="single"] [data-gutter] [data-separator-content],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-content] {
  display: block;
  width: auto;
  height: auto;
  border: 0;
  background: transparent;
  margin-left: 4px;
  padding-inline: 0;
  cursor: pointer;
  white-space: nowrap;
}

[data-diff-type="single"] [data-gutter] [data-expand-all-button],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-all-button] {
  position: relative;
  display: inline-grid;
  width: auto;
  min-width: max-content;
  margin-left: 6px;
  padding-inline: 6px;
  text-transform: lowercase;
  white-space: nowrap;
}

[data-diff-type="single"] [data-gutter] [data-expand-all-button]::before,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-all-button]::before {
  content: "";
  display: block;
  position: absolute;
  top: 50%;
  left: -8px;
  width: 3px;
  height: 3px;
  margin-top: -1px;
  border-radius: 2px;
  background-color: var(--diffs-fg-number);
  pointer-events: none;
}

[data-diff-type="single"] [data-gutter] [data-separator-content]:hover,
[data-diff-type="single"] [data-gutter] [data-expand-button]:hover,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-content]:hover,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-button]:hover {
  color: var(--diffs-fg);
}
`;
