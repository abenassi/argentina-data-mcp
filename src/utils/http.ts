export async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    ...options,
    headers: {
      "Accept": "application/json",
      "User-Agent": "argentina-data-mcp/0.1.0",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
  }

  return response.json() as Promise<T>;
}
