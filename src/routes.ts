import { Router } from "express";
import type { Request, Response } from "express";
import type { AppConfig } from "./config";
import { proxyToRapidAPI } from "./proxy";
import { usageLogger } from "./logger";

export function buildPaymentRoutes(config: AppConfig): Record<string, any> {
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

  return routes;
}

export function buildProxyRouter(config: AppConfig, apiKey: string): Router {
  const router = Router();

  for (const service of config.services) {
    const method = service.method.toLowerCase() as "get" | "post";

    router[method](`/${service.path}`, async (req: Request, res: Response) => {
      const startTime = Date.now();
      
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

        // Log the API usage
        usageLogger.log({
          method: service.method,
          path: `/${service.path}`,
          rapidapiHost: service.rapidapi.host,
          rapidapiPath: service.rapidapi.path,
          price: service.price,
          status: result.status,
          durationMs: Date.now() - startTime,
          userAgent: req.headers['user-agent'],
        });

        res.status(result.status).json(result.data);
      } catch (error) {
        // Log failed request (internal only)
        usageLogger.log({
          method: service.method,
          path: `/${service.path}`,
          rapidapiHost: service.rapidapi.host,
          rapidapiPath: service.rapidapi.path,
          price: service.price,
          status: 502,
          durationMs: Date.now() - startTime,
          userAgent: req.headers['user-agent'],
        });

        // Generic error response (hide upstream details)
        res.status(502).json({ error: "Service temporarily unavailable" });
      }
    });
  }

  return router;
}
