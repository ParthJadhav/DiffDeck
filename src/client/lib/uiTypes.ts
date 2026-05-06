export type ThemeChoice = "system" | "light" | "dark";
export type DiffLayout = "split" | "unified";
export type HunkSeparatorMode = "line-info" | "line-info-basic" | "metadata" | "simple" | "custom";
export type OverflowMode = "scroll" | "wrap";

export const AGENT_CONFIGS = [
  { id: "opencode", label: "OpenCode" },
  { id: "codex", label: "Codex" },
] as const;

export type AgentType = (typeof AGENT_CONFIGS)[number]["id"];
export const AGENT_TYPES = AGENT_CONFIGS.map((config) => config.id) as readonly AgentType[];

export function isAgentType(value: string): value is AgentType {
  return (AGENT_TYPES as readonly string[]).includes(value);
}
