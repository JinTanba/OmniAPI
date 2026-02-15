import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { proxyToRapidAPI } from "../src/proxy";
import type { RapidAPIBackend } from "../src/config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(
  status: number,
  body: unknown,
  contentType = "application/json",
) {
  globalThis.fetch = mock(async () => {
    const headers = new Headers({ "content-type": contentType });
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      { status, headers },
    );
  }) as typeof fetch;
}

const translateBackend: RapidAPIBackend = {
  host: "google-translate1.p.rapidapi.com",
  path: "/language/translate/v2",
  method: "POST",
};

const weatherBackend: RapidAPIBackend = {
  host: "weatherapi-com.p.rapidapi.com",
  path: "/v1/current.json",
  method: "GET",
};

describe("proxyToRapidAPI", () => {
  test("sends GET request with query params", async () => {
    mockFetch(200, { current: { temp_c: 25 } });

    const result = await proxyToRapidAPI(weatherBackend, "test-api-key", {
      queryParams: { q: "Tokyo" },
    });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({ current: { temp_c: 25 } });

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://weatherapi-com.p.rapidapi.com/v1/current.json?q=Tokyo",
    );
    expect(options.method).toBe("GET");
    expect((options.headers as Record<string, string>)["x-rapidapi-key"]).toBe(
      "test-api-key",
    );
    expect(
      (options.headers as Record<string, string>)["x-rapidapi-host"],
    ).toBe("weatherapi-com.p.rapidapi.com");
  });

  test("sends POST request with JSON body", async () => {
    mockFetch(200, { data: { translations: [{ translatedText: "こんにちは" }] } });

    const result = await proxyToRapidAPI(translateBackend, "test-api-key", {
      body: { q: "hello", target: "ja" },
    });

    expect(result.status).toBe(200);
    expect(result.data).toEqual({
      data: { translations: [{ translatedText: "こんにちは" }] },
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://google-translate1.p.rapidapi.com/language/translate/v2",
    );
    expect(options.method).toBe("POST");
    expect(options.body).toBe(JSON.stringify({ q: "hello", target: "ja" }));
    expect(
      (options.headers as Record<string, string>)["content-type"],
    ).toBe("application/json");
  });

  test("sets x-rapidapi-key and x-rapidapi-host headers", async () => {
    mockFetch(200, {});

    await proxyToRapidAPI(weatherBackend, "my-secret-key", {});

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["x-rapidapi-key"]).toBe("my-secret-key");
    expect(headers["x-rapidapi-host"]).toBe("weatherapi-com.p.rapidapi.com");
  });

  test("handles text response", async () => {
    mockFetch(200, "plain text result", "text/plain");

    const result = await proxyToRapidAPI(weatherBackend, "key", {});

    expect(result.status).toBe(200);
    expect(result.data).toBe("plain text result");
  });

  test("propagates error status codes", async () => {
    mockFetch(429, { message: "Rate limit exceeded" });

    const result = await proxyToRapidAPI(weatherBackend, "key", {});

    expect(result.status).toBe(429);
    expect(result.data).toEqual({ message: "Rate limit exceeded" });
  });

  test("handles GET with no query params", async () => {
    mockFetch(200, { ok: true });

    await proxyToRapidAPI(weatherBackend, "key", {});

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://weatherapi-com.p.rapidapi.com/v1/current.json",
    );
  });

  test("handles multiple query params", async () => {
    mockFetch(200, {});

    await proxyToRapidAPI(weatherBackend, "key", {
      queryParams: { q: "Tokyo", lang: "ja", aqi: "yes" },
    });

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("Tokyo");
    expect(parsed.searchParams.get("lang")).toBe("ja");
    expect(parsed.searchParams.get("aqi")).toBe("yes");
  });
});
