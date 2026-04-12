import "server-only";

export function extractRuntimeChurchId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const record = metadata as Record<string, unknown>;

  return typeof record.runtime_church_id === "string"
    ? record.runtime_church_id
    : null;
}
