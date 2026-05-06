import { spawn } from "node:child_process";

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
export type AgentRunState = "completed" | "needs_input";

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
      onStream?: (chunk: string) => void;
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
      const args = ["run", prompt];
      if (context.executionMode === "shared_session") {
        args.splice(1, 0, "--continue");
      }
      const output = await runCommand(
        "opencode",
        args,
        context.repoRoot,
        context.signal,
        context.onStream,
      );
      return parseAgentOutput(output);
    },
  },
  codex: {
    id: "codex",
    label: "Codex",
    getResumeCommand(context) {
      if (context.executionMode !== "shared_session") return null;
      if (context.sessionId != null) {
        return `codex resume ${context.sessionId}`;
      }
      return "codex resume --last";
    },
    async runBatch(comments, context) {
      const prompt = buildBatchPrompt(comments, context.callbackBaseUrl);
      const args = ["exec", prompt];
      if (context.executionMode === "shared_session") {
        args.splice(1, 0, "--continue");
      }
      const output = await runCommand(
        "codex",
        args,
        context.repoRoot,
        context.signal,
        context.onStream,
      );
      return parseAgentOutput(output);
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
      `Comment ID: ${comment.id}`,
      `File: ${comment.filePath}`,
      `Line: ${comment.lineNumber} (${comment.side})`,
      `Comment: ${comment.body}`,
      "Context:",
      context.length > 0 ? context : "(none)",
    ].join("\n");
  });
  return [
    "You are handling batched review comments from a local diff review app for one file.",
    "If comments are code-fix requests, modify files in this repo and keep the patch minimal.",
    "IMPORTANT: Do not rely on transcript output for status.",
    "You MUST call callback endpoints per comment ID when each item is complete.",
    `Callback base URL: ${callbackBaseUrl}`,
    "Callback format:",
    "POST <BASE_URL>/api/agent-queue/comment/<COMMENT_ID>/complete",
    "JSON body: {\"response\":\"<short final message>\"} on success",
    "JSON body: {\"error\":\"<short error or clarification>\"} on failure/needs-input",
    "Use a real HTTP call (for example: curl) to send the callback.",
    "If multiple comments were batched, callback once for EACH comment ID.",
    "Use concise callback messages (1 sentence).",
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
  onStream?: (chunk: string) => void,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      onStream?.(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      onStream?.(text);
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
  const match = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i);
  return match?.[0] ?? null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
