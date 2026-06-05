function djb2Hex(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    hash = hash >>> 0;
  }
  return hash.toString(16).padStart(8, "0").repeat(8);
}

export async function computeFingerprint(
  route: string,
  category: string,
  errorMessage: string | null,
): Promise<string> {
  const input = `${route}::${category}::${errorMessage ?? ""}`;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const encoded = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      return djb2Hex(input);
    }
  }

  return djb2Hex(input);
}
