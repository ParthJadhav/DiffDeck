import React from "react";
import ReactDOM from "react-dom/client";
import { preloadHighlighter } from "@pierre/diffs";
import { App } from "./App.js";
import { highlighterLangs, themeOptions } from "./lib/constants.js";
import "./styles.css";

void preloadHighlighter({
  langs: [...highlighterLangs],
  themes: Object.values(themeOptions),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
