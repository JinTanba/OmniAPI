import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../src/config";
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const TMP_DIR = join(import.meta.dir, "__tmp__");

function writeTmpJson(filename: string, data: unknown): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, filename);
  writeFileSync(path, JSON.stringify(data));
  return path;
}

afterEach(() => {
  try {
    rmSync(TMP_DIR, { recursive: true });
  } catch {}
});

describe("loadConfig", () => {
  test("loads a valid config file", () => {
    const path = writeTmpJson("valid.json", {
      payTo: "0xABC123",
      network: "eip155:84532",
      services: [
        {
          path: "translate",
          method: "POST",
          price: "$0.001",
          description: "Translate text",
          rapidapi: {
            host: "google-translate1.p.rapidapi.com",
            path: "/language/translate/v2",
            method: "POST",
          },
        },
      ],
    });

    const config = loadConfig(path);

    expect(config.payTo).toBe("0xABC123");
    expect(config.network).toBe("eip155:84532");
    expect(config.services).toHaveLength(1);
    expect(config.services[0].path).toBe("translate");
    expect(config.services[0].rapidapi.host).toBe(
      "google-translate1.p.rapidapi.com",
    );
  });

  test("loads config with multiple services", () => {
    const path = writeTmpJson("multi.json", {
      payTo: "0xABC123",
      network: "eip155:84532",
      services: [
        {
          path: "translate",
          method: "POST",
          price: "$0.001",
          description: "Translate",
          rapidapi: {
            host: "translate.p.rapidapi.com",
            path: "/v2",
            method: "POST",
          },
        },
        {
          path: "weather",
          method: "GET",
          price: "$0.002",
          description: "Weather",
          rapidapi: {
            host: "weather.p.rapidapi.com",
            path: "/current.json",
            method: "GET",
          },
        },
      ],
    });

    const config = loadConfig(path);
    expect(config.services).toHaveLength(2);
    expect(config.services[1].path).toBe("weather");
  });

  test("throws on missing file", () => {
    expect(() => loadConfig("/nonexistent/path.json")).toThrow();
  });

  test("throws on invalid JSON", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const path = join(TMP_DIR, "bad.json");
    writeFileSync(path, "not json{{{");
    expect(() => loadConfig(path)).toThrow();
  });

  test("throws on missing payTo", () => {
    const path = writeTmpJson("no-payto.json", {
      network: "eip155:84532",
      services: [
        {
          path: "x",
          method: "GET",
          price: "$0.001",
          description: "x",
          rapidapi: { host: "h", path: "/p", method: "GET" },
        },
      ],
    });
    expect(() => loadConfig(path)).toThrow("payTo");
  });

  test("throws on missing network", () => {
    const path = writeTmpJson("no-network.json", {
      payTo: "0xABC",
      services: [
        {
          path: "x",
          method: "GET",
          price: "$0.001",
          description: "x",
          rapidapi: { host: "h", path: "/p", method: "GET" },
        },
      ],
    });
    expect(() => loadConfig(path)).toThrow("network");
  });

  test("throws on empty services array", () => {
    const path = writeTmpJson("empty-services.json", {
      payTo: "0xABC",
      network: "eip155:84532",
      services: [],
    });
    expect(() => loadConfig(path)).toThrow("services");
  });

  test("throws on missing services field", () => {
    const path = writeTmpJson("no-services.json", {
      payTo: "0xABC",
      network: "eip155:84532",
    });
    expect(() => loadConfig(path)).toThrow("services");
  });

  test("throws on service missing rapidapi field", () => {
    const path = writeTmpJson("no-rapidapi.json", {
      payTo: "0xABC",
      network: "eip155:84532",
      services: [
        {
          path: "x",
          method: "GET",
          price: "$0.001",
          description: "x",
        },
      ],
    });
    expect(() => loadConfig(path)).toThrow("rapidapi");
  });

  test("throws on service missing path", () => {
    const path = writeTmpJson("no-path.json", {
      payTo: "0xABC",
      network: "eip155:84532",
      services: [
        {
          method: "GET",
          price: "$0.001",
          description: "x",
          rapidapi: { host: "h", path: "/p", method: "GET" },
        },
      ],
    });
    expect(() => loadConfig(path)).toThrow("path");
  });
});
