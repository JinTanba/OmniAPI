import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension,
} from "@x402/extensions/bazaar";
import { loadConfig } from "./config";
import { buildPaymentRoutes, buildProxyRouter } from "./routes";
import { usageLogger } from "./logger";

const config = loadConfig("./services.json");

const apiKey = process.env.RAPIDAPI_KEY;
if (!apiKey) {
  console.error("RAPIDAPI_KEY environment variable is required");
  process.exit(1);
}

const testMode = process.env.TEST_MODE === "true";
const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });

// Parse network string (e.g., "eip155:84532")
const [namespace, chainId] = config.network.split(":");
const typedNetwork = { namespace, chainId: parseInt(chainId) } as any;

const resourceServer = new x402ResourceServer(facilitator)
  .register(typedNetwork, new ExactEvmScheme())
  .registerExtension(bazaarResourceServerExtension);

const paymentRoutes = buildPaymentRoutes(config);

const app = express();
app.use(express.json());

// Test mode: skip payment middleware
if (testMode) {
  console.log("⚠️  TEST MODE: Payment bypassed");
  app.use((req: Request, res: Response, next: NextFunction) => {
    (req as any).payment = { paid: true, testMode: true };
    next();
  });
} else {
  app.use(paymentMiddleware(paymentRoutes, resourceServer));
}

// ═══════════════════════════════════════════════════════════════════════
// STATIC & DISCOVERY ROUTES (before proxy router)
// ═══════════════════════════════════════════════════════════════════════

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", testMode });
});

// x402 Discovery endpoint for Bazaar
app.get("/.well-known/x402/discovery", (_req, res) => {
  const limit = Math.min(parseInt(_req.query.limit as string) || 100, 100);
  const offset = parseInt(_req.query.offset as string) || 0;

  const resources = config.services.slice(offset, offset + limit).map((s) => {
    const price = parseFloat(s.price.replace("$", ""));
    const amount = Math.round(price * 1000); // $0.001 = 1000 units

    return {
      resource: `https://omniapi.hugen.tokyo/${s.path}`,
      description: s.description,
      accepts: [
        {
          asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
          maxAmountRequired: amount,
          maxTimeoutSeconds: 60,
          network: "base",
          payTo: config.payTo,
          scheme: "exact",
          extra: {
            name: "USD Coin",
            version: "2",
          },
          outputSchema: {
            input: {
              method: s.method,
              type: "http",
            },
            output: {
              type: "json",
            },
          },
        },
      ],
    };
  });

  res.json({
    resources,
    pagination: {
      total: config.services.length,
      offset,
      limit,
    },
  });
});

// API Catalog
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

// Usage logs API
app.get("/logs", (_req, res) => {
  const limit = parseInt(_req.query.limit as string) || 100;
  res.json(usageLogger.getLogs(limit));
});

// Usage stats API
app.get("/stats", (_req, res) => {
  res.json(usageLogger.getStats());
});

// Clear logs
app.delete("/logs", (_req, res) => {
  usageLogger.clear();
  res.json({ status: "cleared" });
});

// Serve static dashboards
app.get("/usage", (_req, res) => {
  res.sendFile(process.cwd() + "/usage.html");
});

app.get("/catalog-ui", (_req, res) => {
  res.sendFile(process.cwd() + "/catalog.html");
});

// ═══════════════════════════════════════════════════════════════════════
// API PROXY ROUTES (after static routes)
// ═══════════════════════════════════════════════════════════════════════

app.use(buildProxyRouter(config, apiKey));

// ═══════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════

const port = process.env.PORT ?? 4000;

app.listen(port, () => {
  console.log(`🚀 OmniAPI server listening on port ${port}`);
  console.log(`   Facilitator: ${facilitatorUrl}`);
  console.log(`   Services: ${config.services.length}`);
  console.log(`   Test Mode: ${testMode ? "ON" : "OFF"}`);
  console.log(`   Usage: http://localhost:${port}/usage`);
  console.log(`   Catalog: http://localhost:${port}/catalog-ui`);
  console.log(`   Bazaar Discovery: http://localhost:${port}/.well-known/x402/discovery`);
});
