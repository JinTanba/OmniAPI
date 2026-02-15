import "dotenv/config";
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import express from "express";
import type { Server } from "http";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { registerExactEvmScheme } from "@x402/evm/exact/client";
import { privateKeyToAccount } from "viem/accounts";
import { loadConfig } from "../src/config";
import { buildPaymentRoutes, buildProxyRouter } from "../src/routes";
import { join } from "path";

const RAPIDAPI_KEY = "b8c3d5c1e1mshd26f8f49813adbcp1c4c66jsn54e73a379cd6";
const PAYER_PRIVATE_KEY =
  process.env.PAYER_PRIVATE_KEY ??
  "0x04113911fb5a486ba47415464f42c621da5b019d8aeaa1df288b7407d9d9c324";
const FACILITATOR_URL =
  process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
const CONFIG_PATH = join(import.meta.dir, "../services.json");

let server: Server;
let baseUrl: string;
let paidFetch: typeof fetch;

beforeAll(async () => {
  // 1. Load config
  const config = loadConfig(CONFIG_PATH);

  // 2. Set up x402 resource server (server side)
  const facilitator = new HTTPFacilitatorClient({ url: FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    config.network,
    new ExactEvmScheme(),
  );

  // 3. Build Express app with payment middleware + proxy
  const paymentRoutes = buildPaymentRoutes(config);
  const app = express();
  app.use(express.json());
  app.use(paymentMiddleware(paymentRoutes, resourceServer));
  app.use(buildProxyRouter(config, RAPIDAPI_KEY));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/catalog", (_req, res) =>
    res.json(
      config.services.map((s) => ({
        path: `/${s.path}`,
        method: s.method,
        price: s.price,
        description: s.description,
      })),
    ),
  );

  // 4. Start server
  server = app.listen(0);
  const addr = server.address() as any;
  baseUrl = `http://localhost:${addr.port}`;
  console.log(`x402 E2E server started at ${baseUrl}`);

  // 5. Set up x402 fetch client (payer side)
  const signer = privateKeyToAccount(PAYER_PRIVATE_KEY as `0x${string}`);
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  paidFetch = wrapFetchWithPayment(fetch, client);
});

afterAll(() => {
  server?.close();
});

describe("x402 E2E: Full payment flow on Base Sepolia", () => {
  test("health endpoint works without payment", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.status).toBe("ok");
  });

  test("catalog endpoint works without payment", async () => {
    const res = await fetch(`${baseUrl}/catalog`);
    expect(res.status).toBe(200);
    const catalog = (await res.json()) as any[];
    expect(catalog.length).toBeGreaterThanOrEqual(7);
  });

  test("protected endpoint returns 402 without payment", async () => {
    const res = await fetch(`${baseUrl}/user?username=elonmusk`);
    expect(res.status).toBe(402);
  });

  test("GET /user — pay with x402 and get Twitter profile", async () => {
    const res = await paidFetch(`${baseUrl}/user?username=elonmusk`);

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.result.data.user.result.core.screen_name).toBe("elonmusk");
  });

  test("GET /user-tweets — pay with x402 and get tweets", async () => {
    const res = await paidFetch(
      `${baseUrl}/user-tweets?user=44196397&count=1`,
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.result).toBeDefined();
    expect(data.result.timeline).toBeDefined();
  });

  test("POST /instagram/profile — pay with x402 and get IG profile", async () => {
    const res = await paidFetch(`${baseUrl}/instagram/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "instagram" }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.result.username).toBe("instagram");
  });
});
