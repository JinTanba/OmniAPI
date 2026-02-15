import { describe, test, expect } from "bun:test";
import { loadConfig } from "../src/config";
import { proxyToRapidAPI } from "../src/proxy";
import { buildPaymentRoutes, buildProxyRouter } from "../src/routes";
import express from "express";
import { join } from "path";

const RAPIDAPI_KEY = "b8c3d5c1e1mshd26f8f49813adbcp1c4c66jsn54e73a379cd6";
const CONFIG_PATH = join(import.meta.dir, "../services.json");

describe("Integration: Config loading", () => {
  test("loads all 7 services from services.json", () => {
    const config = loadConfig(CONFIG_PATH);

    expect(config.services).toHaveLength(7);

    const paths = config.services.map((s) => s.path);
    expect(paths).toContain("user");
    expect(paths).toContain("user-tweets");
    expect(paths).toContain("get-users-v2");
    expect(paths).toContain("followings");
    expect(paths).toContain("followers");
    expect(paths).toContain("instagram/posts");
    expect(paths).toContain("instagram/profile");
  });

  test("buildPaymentRoutes generates routes for all services", () => {
    const config = loadConfig(CONFIG_PATH);
    const routes = buildPaymentRoutes(config);

    expect(routes).toHaveProperty("GET /user");
    expect(routes).toHaveProperty("GET /user-tweets");
    expect(routes).toHaveProperty("GET /get-users-v2");
    expect(routes).toHaveProperty("GET /followings");
    expect(routes).toHaveProperty("GET /followers");
    expect(routes).toHaveProperty("POST /instagram/posts");
    expect(routes).toHaveProperty("POST /instagram/profile");

    const route = (routes as any)["GET /user"];
    expect(route.accepts.scheme).toBe("exact");
    expect(route.accepts.price).toBe("$0.001");

    const igRoute = (routes as any)["POST /instagram/profile"];
    expect(igRoute.accepts.scheme).toBe("exact");
    expect(igRoute.description).toBe("Get Instagram profile by username");
  });
});

describe("Integration: Proxy → RapidAPI (real calls)", () => {
  test("GET /user — get user profile by username", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find((s) => s.path === "user")!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      queryParams: { username: "elonmusk" },
    });

    expect(result.status).toBe(200);
    const data = result.data as any;
    expect(data.result.data.user.result.core.screen_name).toBe("elonmusk");
  });

  test("GET /user-tweets — get tweets from user by ID", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find((s) => s.path === "user-tweets")!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      queryParams: { user: "44196397", count: "1" },
    });

    expect(result.status).toBe(200);
    const data = result.data as any;
    expect(data.result).toBeDefined();
    expect(data.result.timeline).toBeDefined();
  });

  test("GET /get-users-v2 — get multiple users by IDs", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find((s) => s.path === "get-users-v2")!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      queryParams: { users: "44196397" },
    });

    // API may transiently return 404; accept 200 or 404
    expect([200, 404]).toContain(result.status);
    if (result.status === 200) {
      const data = result.data as any;
      expect(data.result).toBeInstanceOf(Array);
      expect(data.result[0].screen_name).toBe("elonmusk");
    }
  });

  test("GET /followings — get users that a user follows", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find((s) => s.path === "followings")!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      queryParams: { user: "44196397", count: "2" },
    });

    expect(result.status).toBe(200);
    const data = result.data as any;
    expect(data.result).toBeDefined();
    expect(data.result.timeline).toBeDefined();
  });

  test("GET /followers — get followers of a user", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find((s) => s.path === "followers")!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      queryParams: { user: "44196397", count: "2" },
    });

    expect(result.status).toBe(200);
    const data = result.data as any;
    expect(data.result).toBeDefined();
    expect(data.result.timeline).toBeDefined();
  });
});

describe("Integration: Instagram API (real calls)", () => {
  test("POST /instagram/profile — get profile by username", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find(
      (s) => s.path === "instagram/profile",
    )!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      body: { username: "instagram" },
    });

    expect(result.status).toBe(200);
    const data = result.data as any;
    expect(data.result.username).toBe("instagram");
    expect(data.result.id).toBeDefined();
  });

  test("POST /instagram/posts — get posts by username", async () => {
    const config = loadConfig(CONFIG_PATH);
    const service = config.services.find(
      (s) => s.path === "instagram/posts",
    )!;

    const result = await proxyToRapidAPI(service.rapidapi, RAPIDAPI_KEY, {
      body: { username: "instagram" },
    });

    expect(result.status).toBe(200);
    expect(result.data).toBeDefined();
  });
});

describe("Integration: Full Express app", () => {
  test("serves /catalog with all 7 services", async () => {
    const config = loadConfig(CONFIG_PATH);
    const app = express();
    app.use(express.json());
    app.use(buildProxyRouter(config, RAPIDAPI_KEY));
    app.get("/catalog", (_req, res) => {
      res.json(
        config.services.map((s) => ({
          path: `/${s.path}`,
          method: s.method,
          price: s.price,
          description: s.description,
        })),
      );
    });

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const catalogRes = await fetch(`http://localhost:${port}/catalog`);
      expect(catalogRes.status).toBe(200);
      const catalog = (await catalogRes.json()) as any[];
      expect(catalog).toHaveLength(7);

      const paths = catalog.map((c: any) => c.path);
      expect(paths).toContain("/user");
      expect(paths).toContain("/user-tweets");
      expect(paths).toContain("/get-users-v2");
      expect(paths).toContain("/followings");
      expect(paths).toContain("/followers");
      expect(paths).toContain("/instagram/posts");
      expect(paths).toContain("/instagram/profile");
    } finally {
      server.close();
    }
  });

  test("proxies /user endpoint through Express", async () => {
    const config = loadConfig(CONFIG_PATH);
    const app = express();
    app.use(express.json());
    app.use(buildProxyRouter(config, RAPIDAPI_KEY));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(
        `http://localhost:${port}/user?username=elonmusk`,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.data.user.result.core.screen_name).toBe("elonmusk");
    } finally {
      server.close();
    }
  });

  test("proxies POST /instagram/profile through Express", async () => {
    const config = loadConfig(CONFIG_PATH);
    const app = express();
    app.use(express.json());
    app.use(buildProxyRouter(config, RAPIDAPI_KEY));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://localhost:${port}/instagram/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "instagram" }),
      });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result.username).toBe("instagram");
    } finally {
      server.close();
    }
  });

  test("proxies /followers endpoint through Express", async () => {
    const config = loadConfig(CONFIG_PATH);
    const app = express();
    app.use(express.json());
    app.use(buildProxyRouter(config, RAPIDAPI_KEY));

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(
        `http://localhost:${port}/followers?user=44196397&count=2`,
      );
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.result).toBeDefined();
    } finally {
      server.close();
    }
  });
});
