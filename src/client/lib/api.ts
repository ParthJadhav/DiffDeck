import type { FileDiffMetadata } from "@pierre/diffs";
import type {
  DiffWhitespaceMode,
  ImageSideName,
  ImageSidePayload,
  SessionPayload,
  StructuralPayload,
  UnresolvedFilePayload,
  WriteRequest,
  WriteResult,
} from "../../server/protocol.js";

/** A non-2xx response; `message` is the server's `error` text when it sent one. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** Remote mode puts a capability token in the page URL; every API call carries it. */
function withCapabilityToken(url: string): string {
  if (typeof window === "undefined") return url;
  const token = new URLSearchParams(window.location.search).get("token");
  if (token == null || token.length === 0) return url;
  const resolved = new URL(url, window.location.href);
  resolved.searchParams.set("token", token);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

async function request<T>(url: string, init?: RequestInit, fallbackError?: string): Promise<T> {
  const response = await fetch(withCapabilityToken(url), init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const serverMessage =
      typeof payload?.error === "string" && payload.error.trim().length > 0 ? payload.error : null;
    throw new ApiError(
      serverMessage ?? fallbackError ?? `Request failed: ${response.status} ${response.statusText}`,
      response.status,
    );
  }
  // Always consume the body, even when the caller ignores it, so the browser
  // does not report the completed request as aborted when the page later
  // navigates away (e.g. after sending the review packet to the terminal).
  return (await response.json()) as T;
}

function postJson(body: unknown, init?: RequestInit): RequestInit {
  return {
    ...init,
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  };
}

export const api = {
  session: (rebuild: boolean) => {
    const params = new URLSearchParams({ t: String(Date.now()) });
    if (rebuild) params.set("refresh", "1");
    return request<SessionPayload>(`/api/session?${params.toString()}`);
  },
  setWhitespaceMode: (whitespaceMode: DiffWhitespaceMode) =>
    request<SessionPayload>("/api/preferences", postJson({ whitespaceMode })),
  fileDiff: (path: string, signal?: AbortSignal) =>
    request<FileDiffMetadata>(`/api/file-diff?${new URLSearchParams({ path })}`, { signal }),
  unresolvedFile: (path: string) =>
    request<UnresolvedFilePayload>(`/api/unresolved-file?${new URLSearchParams({ path })}`),
  imageSide: (path: string, side: ImageSideName) =>
    request<ImageSidePayload>(`/api/image?${new URLSearchParams({ path, side })}`),
  structural: (path: string) =>
    request<StructuralPayload>(
      `/api/structural?${new URLSearchParams({ path })}`,
      undefined,
      "Structural diff failed.",
    ),
  openInEditor: (path: string, line = 1) =>
    request<unknown>(
      "/api/editor",
      postJson({ line: Math.max(1, Math.floor(line)), path }),
      "Unable to open the configured editor.",
    ),
  write: (body: WriteRequest, fallbackError: string) =>
    request<WriteResult>("/api/write", postJson(body), fallbackError),
  /** Prints the serialized packet in the terminal that launched DiffDeck. */
  sendReviewPacket: (packetJson: string) =>
    request<unknown>("/api/review-packet", postJson(packetJson)),
  reviewPacketDownloadUrl: () => withCapabilityToken("/api/review-packet/download"),
  eventsUrl: () => withCapabilityToken("/api/events"),
};
