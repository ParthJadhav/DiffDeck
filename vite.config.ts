import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Shiki emits a few large, independently loaded language grammars (largest measured:
    // emacs-lisp 780 kB). The interactive entry is ~205 kB; 800 kB keeps this intentional
    // lazy-grammar exception visible if it grows materially.
    chunkSizeWarningLimit: 800,
    outDir: "dist/client",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@pierre/diffs")) return "diff-engine";
          if (id.includes("node_modules/@pierre/trees")) return "file-tree";
          if (id.includes("node_modules/react-virtuoso")) return "virtualization";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) {
            return "react-runtime";
          }
          return undefined;
        },
      },
    },
  },
  worker: {
    format: "es",
  },
});
