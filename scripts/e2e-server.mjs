import { spawn } from "node:child_process";
import { join } from "node:path";
import { createFixtureRepository } from "./fixture-factory.mjs";

const root = new URL("..", import.meta.url).pathname;
const fixture = createFixtureRepository("review");
const repo = fixture.repo;

const child = spawn(
  process.execPath,
  [
    join(root, "dist/server/cli.js"),
    "--repo",
    repo,
    "--host",
    "127.0.0.1",
    "--port",
    "4187",
    "--no-open",
    "--watch",
    "--write",
    "--editor",
    "true",
  ],
  { stdio: "inherit" },
);

let closing = false;
function close(signal) {
  if (closing) return;
  closing = true;
  child.kill(signal);
  fixture.cleanup();
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    close(signal);
  });
}

child.on("exit", (code, signal) => {
  fixture.cleanup();
  if (!closing) process.exitCode = code ?? (signal == null ? 1 : 0);
});
