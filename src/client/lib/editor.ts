import { fetchWithCapability } from "./api.js";

export async function openInEditor(path: string, line = 1): Promise<void> {
  const response = await fetchWithCapability("/api/editor", {
    body: JSON.stringify({ line: Math.max(1, Math.floor(line)), path }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response.ok) return;
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  throw new Error(payload?.error ?? "Unable to open the configured editor.");
}
