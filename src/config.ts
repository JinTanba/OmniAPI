import { readFileSync } from "fs";

export interface RapidAPIBackend {
  host: string;
  path: string;
  method: string;
}

export interface ServiceConfig {
  path: string;
  method: string;
  price: string;
  description: string;
  rapidapi: RapidAPIBackend;
}

export interface AppConfig {
  payTo: string;
  network: string;
  services: ServiceConfig[];
}

export function loadConfig(filePath: string): AppConfig {
  const raw = readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);

  if (!data.payTo || typeof data.payTo !== "string") {
    throw new Error("Config validation error: missing or invalid 'payTo'");
  }

  if (!data.network || typeof data.network !== "string") {
    throw new Error("Config validation error: missing or invalid 'network'");
  }

  if (!Array.isArray(data.services) || data.services.length === 0) {
    throw new Error(
      "Config validation error: 'services' must be a non-empty array",
    );
  }

  for (const service of data.services) {
    if (!service.path || typeof service.path !== "string") {
      throw new Error(
        "Config validation error: each service must have a 'path'",
      );
    }
    if (!service.method || typeof service.method !== "string") {
      throw new Error(
        "Config validation error: each service must have a 'method'",
      );
    }
    if (!service.price || typeof service.price !== "string") {
      throw new Error(
        "Config validation error: each service must have a 'price'",
      );
    }
    if (!service.description || typeof service.description !== "string") {
      throw new Error(
        "Config validation error: each service must have a 'description'",
      );
    }
    if (!service.rapidapi || typeof service.rapidapi !== "object") {
      throw new Error(
        "Config validation error: each service must have a 'rapidapi' backend config",
      );
    }
    const backend = service.rapidapi;
    if (!backend.host || !backend.path || !backend.method) {
      throw new Error(
        "Config validation error: 'rapidapi' must have host, path, and method",
      );
    }
  }

  return data as AppConfig;
}
