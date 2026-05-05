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

export const themeChoices = ["system", "light", "dark"] as const;
export const diffLayouts = ["split", "unified"] as const;
export const fileTreeShapeOptions = { flattenEmptyDirectories: true } as const;
export const hunkSeparatorModes = [
  "line-info",
  "line-info-basic",
  "metadata",
  "simple",
  "custom",
] as const;
export const overflowModes = ["scroll", "wrap"] as const;

export const stickyFileHeaderCSS = `
[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--diffs-bg);
}
`;

export const customHunkSeparatorCSS = `
[data-separator="line-info-basic"] {
  height: 30px;
  background: color-mix(in lab, var(--diffs-fg-number) 6%, var(--diffs-bg));
  position: relative;
  border-block: 1px solid color-mix(in lab, var(--diffs-fg-number) 18%, transparent);
}

[data-diff-type="single"] [data-gutter] [data-separator-wrapper],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-wrapper] {
  position: absolute;
  left: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  margin-left: calc(-2ch - 2px);
  background: transparent;
  color: color-mix(in lab, var(--diffs-fg) 78%, var(--diffs-fg-number));
  font-family: var(--diffs-header-font-family, var(--diffs-header-font-fallback));
  font-size: 0.78rem;
  font-weight: 500;
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
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid color-mix(in lab, var(--diffs-fg-number) 55%, transparent);
  border-radius: 6px;
  background: var(--diffs-bg);
  color: var(--diffs-fg);
  font: inherit;
  font-weight: 600;
  line-height: 1;
  flex: 0 0 auto;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
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
  font-weight: 500;
}

[data-diff-type="single"] [data-gutter] [data-expand-all-button],
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-all-button] {
  position: relative;
  display: inline-grid;
  width: auto;
  height: 22px;
  min-width: max-content;
  margin-left: 10px;
  padding-inline: 10px;
  border: 1px solid color-mix(in lab, var(--diffs-fg-number) 55%, transparent);
  border-radius: 999px;
  background: var(--diffs-bg);
  text-transform: lowercase;
  white-space: nowrap;
  font-weight: 600;
}

[data-diff-type="single"] [data-gutter] [data-expand-all-button]::before,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-all-button]::before {
  content: none;
}

[data-diff-type="single"] [data-gutter] [data-separator-content]:hover,
[data-diff-type="single"] [data-gutter] [data-expand-button]:hover,
[data-diff-type="single"] [data-gutter] [data-expand-all-button]:hover,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-separator-content]:hover,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-button]:hover,
[data-diff-type="split"] [data-deletions] [data-gutter] [data-expand-all-button]:hover {
  color: var(--diffs-fg);
  border-color: color-mix(in lab, var(--diffs-fg-number) 90%, transparent);
  background: color-mix(in lab, var(--diffs-fg-number) 14%, var(--diffs-bg));
}
`;
