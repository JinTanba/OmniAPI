import type { RapidAPIBackend } from "./config";

export async function proxyToRapidAPI(
  backend: RapidAPIBackend,
  apiKey: string,
  request: { queryParams?: Record<string, string>; body?: unknown },
): Promise<{ status: number; data: unknown }> {
  const url = new URL(`https://${backend.host}${backend.path}`);

  if (request.queryParams) {
    for (const [key, value] of Object.entries(request.queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    "x-rapidapi-key": apiKey,
    "x-rapidapi-host": backend.host,
  };

  const fetchOptions: RequestInit = {
    method: backend.method,
    headers,
  };

  if (
    request.body &&
    (backend.method === "POST" ||
      backend.method === "PUT" ||
      backend.method === "PATCH")
  ) {
    headers["content-type"] = "application/json";
    fetchOptions.body = JSON.stringify(request.body);
  }

  const response = await fetch(url.toString(), fetchOptions);

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  return { status: response.status, data };
}
