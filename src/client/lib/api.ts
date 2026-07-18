export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithCapability(url, init);
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;
    const serverMessage =
      typeof payload?.error === "string" && payload.error.trim().length > 0 ? payload.error : null;
    throw new Error(serverMessage ?? `Request failed: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function withCapabilityToken(url: string): string {
  if (typeof window === "undefined") return url;
  const token = new URLSearchParams(window.location.search).get("token");
  if (token == null || token.length === 0) return url;
  const resolved = new URL(url, window.location.href);
  resolved.searchParams.set("token", token);
  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
}

export function fetchWithCapability(url: string, init?: RequestInit): Promise<Response> {
  return fetch(withCapabilityToken(url), init);
}
