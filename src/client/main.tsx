import React from "react";
import ReactDOM from "react-dom/client";
import { preloadHighlighter } from "@pierre/diffs";
import { App } from "./App.js";
import { highlighterLangs, themeOptions } from "./lib/constants.js";
import "./styles.css";

// Warm the shared Shiki highlighter so first paint isn't blocked on async
// theme/language loading. Worker pool inherits this preloaded state.
void preloadHighlighter({
  langs: [...highlighterLangs],
  themes: Object.values(themeOptions),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
