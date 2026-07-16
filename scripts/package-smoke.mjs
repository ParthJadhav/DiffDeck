import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFixtureRepository } from "./fixture-factory.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "diffdeck-package-smoke-"));
const installRoot = join(temporaryRoot, "install");
const fixture = createFixtureRepository("review");

try {
  const packOutput = JSON.parse(
    execFileSync(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryRoot],
      { cwd: projectRoot, encoding: "utf8" },
    ),
  );
  const filename = packOutput[0]?.filename;
  if (typeof filename !== "string") throw new Error("npm pack did not report a tarball filename.");
  const tarball = join(temporaryRoot, filename);
  execFileSync("npm", ["init", "-y"], { cwd: temporaryRoot, stdio: "ignore" });
  execFileSync(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--no-package-lock",
      "--prefix",
      installRoot,
      tarball,
    ],
    { cwd: temporaryRoot, stdio: "pipe" },
  );

  const binary = join(installRoot, "node_modules", ".bin", "diffdeck");
  const version = execFileSync(binary, ["--version"], { encoding: "utf8" }).trim();
  if (version !== "0.4.1")
    throw new Error(`Installed binary reported unexpected version ${version}.`);
  const help = execFileSync(binary, ["--help"], { encoding: "utf8" });
  if (!help.includes("--watch") || !help.includes("--write") || !help.includes("--structural")) {
    throw new Error("Installed binary help is missing shipped options.");
  }

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    await runServerCycle(binary, fixture.repo, cycle);
  }
  console.log(
    `Installed tarball smoke passed on ${process.version}; 3 start/shutdown cycles were clean.`,
  );
} finally {
  fixture.cleanup();
  rmSync(temporaryRoot, { force: true, recursive: true });
}

async function runServerCycle(binary, repo, cycle) {
  const child = spawn(binary, ["--repo", repo, "--port", "0", "--no-open"], {
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let errorOutput = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errorOutput += chunk;
  });

  try {
    const url = await waitForServerUrl(() => output, child);
    const response = await fetch(`${url}api/session`);
    if (!response.ok)
      throw new Error(`Cycle ${cycle} session request failed with ${response.status}.`);
    const payload = await response.json();
    if (!Array.isArray(payload.files) || payload.files.length === 0) {
      throw new Error(`Cycle ${cycle} did not render the fixture.`);
    }
    child.kill("SIGTERM");
    const result = await waitForExit(child, 5_000);
    if (result.code !== 0) {
      throw new Error(
        `Cycle ${cycle} exited with code ${result.code ?? "null"}: ${errorOutput || output}`,
      );
    }
    try {
      await fetch(`${url}api/session`, { signal: AbortSignal.timeout(400) });
      throw new Error(`Cycle ${cycle} left its server port reachable.`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("left its server port")) throw error;
    }
  } finally {
    if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL");
  }
}

async function waitForServerUrl(readOutput, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const match = readOutput().match(/Diffdeck server running at (http:\/\/\S+)/);
    if (match != null) return match[1];
    if (child.exitCode != null) throw new Error(`Installed server exited before startup.`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 25));
  }
  throw new Error("Timed out waiting for the installed server URL.");
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode != null || child.signalCode != null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  return await new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(
      () => rejectPromise(new Error("Installed server did not shut down.")),
      timeoutMs,
    );
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal });
    });
  });
}
