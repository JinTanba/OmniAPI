import { Router } from "express";
import type { Request, Response } from "express";
import type { RoutesConfig } from "@x402/express";
import type { AppConfig } from "./config";
import { proxyToRapidAPI } from "./proxy";

export function buildPaymentRoutes(config: AppConfig): RoutesConfig {
  const routes: Record<string, any> = {};

  for (const service of config.services) {
    const key = `${service.method.toUpperCase()} /${service.path}`;
    routes[key] = {
      accepts: {
        scheme: "exact",
        price: service.price,
        network: config.network,
        payTo: config.payTo,
      },
      description: service.description,
    };
  }

  return routes as RoutesConfig;
}

export function buildProxyRouter(config: AppConfig, apiKey: string): Router {
  const router = Router();

  for (const service of config.services) {
    const method = service.method.toLowerCase() as "get" | "post";

    router[method](`/${service.path}`, async (req: Request, res: Response) => {
      try {
        const queryParams: Record<string, string> = {};
        if (req.query) {
          for (const [key, value] of Object.entries(req.query)) {
            if (typeof value === "string") {
              queryParams[key] = value;
            }
          }
        }

        const result = await proxyToRapidAPI(service.rapidapi, apiKey, {
          queryParams:
            Object.keys(queryParams).length > 0 ? queryParams : undefined,
          body: req.body,
        });

        res.status(result.status).json(result.data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        res.status(502).json({ error: "Proxy error", message });
      }
    });
  }

  return router;
}
