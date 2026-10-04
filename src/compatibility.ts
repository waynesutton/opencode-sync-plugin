import { parse, type ParseError } from "jsonc-parser";

// Accept OpenCode's JSONC syntax without stripping comment-like text in strings.
export function hasSyncPlugin(content: string): boolean {
  const errors: ParseError[] = [];
  const config: unknown = parse(content, errors, { allowTrailingComma: true });
  if (errors.length || !config || typeof config !== "object") return false;
  const plugins = (config as Record<string, unknown>).plugin;
  return Array.isArray(plugins) && plugins.some((entry: unknown) =>
    typeof entry === "string" && (entry === "opencode-sync-plugin" ||
      /^opencode-sync-plugin@\S+$/.test(entry)));
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
}
function text(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// Newer snapshots nest model metadata; keep support for older flat snapshots.
export function messageIdentity(value: unknown): { model?: string; provider?: string } {
  const data = record(value);
  const nested = record(data.model);
  return {
    model: text(nested.modelID) ?? text(data.modelID),
    provider: text(nested.providerID) ?? text(data.providerID),
  };
}
