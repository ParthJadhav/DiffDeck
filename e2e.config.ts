import { web } from "@e2e-dev/web";
import type { E2EConfig } from "e2e";
import { googleChrome } from "./e2e-army/chrome-provider.js";

export default {
  tests: "e2e-army/**/*.e2e.ts",
  targets: [
    {
      name: "google-chrome",
      engine: web({ browser: googleChrome(), viewport: { width: 1280, height: 800 } }),
      app: {
        url: "http://127.0.0.1:4311",
        readyUrl: "http://127.0.0.1:4311/api/session",
        command: {
          executable: "node",
          args: ["scripts/e2e-server.mjs"],
          env: { DIFFDECK_E2E_PORT: "4311" },
          log: ".e2e/logs/app.log",
        },
      },
    },
  ],
  workers: 1,
  retries: 0,
  timeout: 60_000,
  assertionTimeout: 10_000,
  cache: "off",
  trace: "retain-on-failure",
  reporters: ["list", "markdown", "junit"],
} satisfies E2EConfig;
