import "dotenv/config";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { loadConfig } from "./config";
import { buildPaymentRoutes, buildProxyRouter } from "./routes";

const config = loadConfig("./services.json");

const apiKey = process.env.RAPIDAPI_KEY;
if (!apiKey) {
  console.error("RAPIDAPI_KEY environment variable is required");
  process.exit(1);
}

const facilitatorUrl =
  process.env.FACILITATOR_URL ?? "https://x402.org/facilitator";
const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });

const resourceServer = new x402ResourceServer(facilitator).register(
  config.network,
  new ExactEvmScheme(),
);

const paymentRoutes = buildPaymentRoutes(config);

const app = express();
app.use(express.json());

app.use(paymentMiddleware(paymentRoutes, resourceServer));

app.use(buildProxyRouter(config, apiKey));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

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

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  console.log(`rapidapi-x402 server listening on port ${port}`);
  console.log(`Facilitator: ${facilitatorUrl}`);
  console.log(`Services: ${config.services.length}`);
});
