import { describe, test, expect, mock, afterEach } from "bun:test";
import { buildPaymentRoutes, buildProxyRouter } from "../src/routes";
import type { AppConfig } from "../src/config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const testConfig: AppConfig = {
  payTo: "0xABC123",
  network: "eip155:84532",
  services: [
    {
      path: "translate",
      method: "POST",
      price: "$0.001",
      description: "Translate text via Google Translate",
      rapidapi: {
        host: "google-translate1.p.rapidapi.com",
        path: "/language/translate/v2",
        method: "POST",
      },
    },
    {
      path: "weather",
      method: "GET",
      price: "$0.002",
      description: "Current weather data",
      rapidapi: {
        host: "weatherapi-com.p.rapidapi.com",
        path: "/v1/current.json",
        method: "GET",
      },
    },
  ],
};

describe("buildPaymentRoutes", () => {
  test("generates route map from config", () => {
    const routes = buildPaymentRoutes(testConfig);

    expect(routes).toHaveProperty("POST /translate");
    expect(routes).toHaveProperty("GET /weather");
  });

  test("sets correct payment options per route", () => {
    const routes = buildPaymentRoutes(testConfig);

    const translateRoute = routes["POST /translate"];
    expect(translateRoute.accepts).toEqual({
      scheme: "exact",
      price: "$0.001",
      network: "eip155:84532",
      payTo: "0xABC123",
    });
    expect(translateRoute.description).toBe(
      "Translate text via Google Translate",
    );
  });

  test("each service gets correct price", () => {
    const routes = buildPaymentRoutes(testConfig);

    const weatherRoute = routes["GET /weather"];
    expect(weatherRoute.accepts).toEqual({
      scheme: "exact",
      price: "$0.002",
      network: "eip155:84532",
      payTo: "0xABC123",
    });
  });
});

describe("buildProxyRouter", () => {
  test("creates an Express router with route handlers", () => {
    const router = buildProxyRouter(testConfig, "test-api-key");

    // Router should be a function (Express middleware)
    expect(typeof router).toBe("function");
  });

  test("GET handler passes query params to proxy", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(JSON.stringify({ current: { temp: 25 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const router = buildProxyRouter(testConfig, "test-api-key");

    // Create mock req/res to test the handler
    const mockReq = {
      method: "GET",
      path: "/weather",
      url: "/weather?q=Tokyo",
      query: { q: "Tokyo" },
      body: undefined,
    };

    let statusCode = 0;
    let jsonData: unknown;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: unknown) {
        jsonData = data;
        return this;
      },
    };

    // Find the handler in the router stack
    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === "/weather",
    );
    expect(layer).toBeTruthy();

    const handler = layer.route.stack[0].handle;
    await handler(mockReq, mockRes);

    expect(statusCode).toBe(200);
    expect(jsonData).toEqual({ current: { temp: 25 } });

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("q=Tokyo");
  });

  test("POST handler passes body to proxy", async () => {
    globalThis.fetch = mock(async () => {
      return new Response(
        JSON.stringify({
          data: { translations: [{ translatedText: "hi" }] },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    const router = buildProxyRouter(testConfig, "test-api-key");

    const mockReq = {
      method: "POST",
      path: "/translate",
      url: "/translate",
      query: {},
      body: { q: "hello", target: "ja" },
    };

    let statusCode = 0;
    let jsonData: unknown;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: unknown) {
        jsonData = data;
        return this;
      },
    };

    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === "/translate",
    );
    expect(layer).toBeTruthy();

    const handler = layer.route.stack[0].handle;
    await handler(mockReq, mockRes);

    expect(statusCode).toBe(200);

    const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBe(JSON.stringify({ q: "hello", target: "ja" }));
  });

  test("proxy error returns 502 with error message", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Connection refused");
    }) as typeof fetch;

    const router = buildProxyRouter(testConfig, "test-api-key");

    const mockReq = {
      method: "GET",
      path: "/weather",
      url: "/weather",
      query: {},
      body: undefined,
    };

    let statusCode = 0;
    let jsonData: unknown;
    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: unknown) {
        jsonData = data;
        return this;
      },
    };

    const layer = (router as any).stack?.find(
      (l: any) => l.route?.path === "/weather",
    );
    const handler = layer.route.stack[0].handle;
    await handler(mockReq, mockRes);

    expect(statusCode).toBe(502);
    expect(jsonData).toEqual({
      error: "Proxy error",
      message: "Connection refused",
    });
  });
});
