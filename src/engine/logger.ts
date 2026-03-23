/**
 * Structured logger for Ark engine.
 */

import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.ARK_LOG_LEVEL ?? (isProduction ? "info" : "debug"),
    transport: isProduction
      ? undefined
      : {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        },
  });
}
