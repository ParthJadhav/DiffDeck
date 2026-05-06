import { spawn } from "node:child_process";
import stripAnsi from "strip-ansi";

export interface CommentContextLine {
  content: string;
  lineNumber: number;
  target: boolean;
}

export interface CommentExportRecord {
  body: string;
  contextLines: CommentContextLine[];
  filePath: string;
  id: string;
  lineNumber: number;
  side: "additions" | "deletions";
}

export type AgentExecutionMode = "shared_session" | "isolated";
export type AgentProviderId = "opencode" | "codex";

export interface AgentRunResult {
  sessionId: string | null;
}

export interface AgentProviderAdapter {
  id: AgentProviderId;
  label: string;
  getResumeCommand(context: {
    executionMode: AgentExecutionMode;
    repoRoot: string;
    sessionId: string | null;
  }): string | null;
  runBatch(
    comments: CommentExportRecord[],
    context: {
      callbackBaseUrl: string;
      executionMode: AgentExecutionMode;
      onPreview?: (chunk: string) => void;
      repoRoot: string;
      signal?: AbortSignal;
    },
  ): Promise<AgentRunResult>;
}

const providerAdapters: Record<AgentProviderId, AgentProviderAdapter> = {
  opencode: {
    id: "opencode",
    label: "OpenCode",
    getResumeCommand(context) {
      if (context.executionMode !== "shared_session") return null;
      if (context.sessionId != null) {
        return `opencode --session ${context.sessionId} --dir ${shellQuote(context.repoRoot)}`;
      }
      return `opencode --continue --dir ${shellQuote(context.repoRoot)}`;
    },
    async runBatch(comments, context) {
      const prompt = buildBatchPrompt(comments, context.callbackBaseUrl);
      const args = ["run", "--format", "json", prompt];
      if (context.executionMode === "shared_session") {
        args.splice(1, 0, "--continue");
      }
      const output = await runCommand(
        "opencode",
        args,
        context.repoRoot,
        context.signal,
        { onPreview: context.onPreview, previewMode: "json" },
      );
      return parseAgentOutput(output);
    },
  },
  // TODO: implement Codex provider
  codex: {
    id: "codex",
    label: "Codex",
    getResumeCommand(_context) {
      return null;
    },
    async runBatch(_comments, _context) {
      throw new Error("Codex provider is not yet implemented.");
    },
  },
};

export function getAgentProviderAdapter(id: AgentProviderId): AgentProviderAdapter {
  return providerAdapters[id];
}

export function isAgentProviderId(value: unknown): value is AgentProviderId {
  return value === "opencode" || value === "codex";
}

function buildBatchPrompt(comments: CommentExportRecord[], callbackBaseUrl: string): string {
  const blocks = comments.map((comment, index) => {
    const context = comment.contextLines
      .map((line) => `${line.target ? ">" : " "} ${line.lineNumber} | ${line.content}`)
      .join("\n");
    return [
      `Comment ${index + 1}`,
      `ID: ${comment.id}`,
      `File: ${comment.filePath}`,
      `Line: ${comment.lineNumber} (${comment.side})`,
      `Comment: ${comment.body}`,
      "Context:",
      context.length > 0 ? context : "(none)",
    ].join("\n");
  });

  const callbackInstruction = [
    "When each comment is addressed, POST a callback (one per comment ID):",
    `  curl -s -X POST ${callbackBaseUrl}/api/agent-queue/comment/<ID>/complete \\`,
    `    -H 'Content-Type: application/json' \\`,
    `    -d '{"response":"<one sentence summary>"}' # or {"error":"..."} on failure`,
  ].join("\n");

  return [
    "Address the following diff review comments. For code-fix requests, edit the files in this repo and keep changes minimal.",
    callbackInstruction,
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

function parseAgentOutput(output: string): AgentRunResult {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    throw new Error("Agent returned no response.");
  }
  const sessionId = extractSessionId(trimmed);
  return { sessionId };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
  options?: { onPreview?: (chunk: string) => void; previewMode: "json" | "raw" },
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let stdoutBuffer = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      if (options?.previewMode === "json") {
        stdoutBuffer += text;
        const lines = stdoutBuffer.split(/\r\n|\n|\r/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const preview = extractPreviewFromJsonLine(line);
          if (preview != null) {
            options.onPreview?.(preview);
          }
        }
      } else {
        options?.onPreview?.(extractLivePreview(stdout));
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
    });
    signal?.addEventListener("abort", () => {
      child.kill("SIGTERM");
      reject(new Error(`Agent command canceled: ${command}`));
    });
    child.on("error", (error) => {
      reject(error);
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Agent command timed out after 180s: ${command}`));
    }, 180_000);

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            `${command} exited with code ${code ?? -1}. Verify the provider CLI is installed and authenticated.`,
        ),
      );
    });
  });
}

function extractSessionId(text: string): string | null {
  const opencodeMatch = text.match(/\bses_[A-Za-z0-9]+\b/);
  if (opencodeMatch?.[0] != null) return opencodeMatch[0];
  const match = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  return match?.[0] ?? null;
}

function extractPreviewFromJsonLine(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed[0] !== "{") return null;
  try {
    const parsed = JSON.parse(trimmed) as { part?: { text?: string }; type?: string };
    if (parsed.type !== "text") return null;
    const text = parsed.part?.text?.trim() ?? "";
    if (text.length === 0) return null;
    return extractLivePreview(text);
  } catch {
    return null;
  }
}

function extractLivePreview(buffer: string): string {
  const lines = stripAnsi(buffer).split(/\r\n|\n|\r/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index].trim();
    if (candidate.length === 0) continue;
    return candidate.length > 160 ? `${candidate.slice(0, 157)}...` : candidate;
  }
  return "";
}


function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
