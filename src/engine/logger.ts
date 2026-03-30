/**
 * Structured logger for Mémoire engine.
 */

import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export function shouldUsePrettyTransport(): boolean {
  if (isProduction) return false;
  if (process.env.NODE_ENV === "test") return false;
  if (process.env.VITEST === "true") return false;
  return true;
}

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.MEMOIRE_LOG_LEVEL ?? process.env.NOCHE_LOG_LEVEL ?? "warn",
    transport: shouldUsePrettyTransport()
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined,
  });
}
