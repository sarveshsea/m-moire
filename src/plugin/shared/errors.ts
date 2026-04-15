// Typed errors for the widget. Command handlers return Result<T, WidgetError>
// so the bridge can serialize a structured payload instead of a bare string.

export const WIDGET_ERROR_CODES = [
  "E_BAD_MESSAGE",
  "E_BAD_BRIDGE",
  "E_BRIDGE_DISCONNECTED",
  "E_BRIDGE_UNREACHABLE",
  "E_BRIDGE_SEND_FAILED",
  "E_TIMEOUT",
  "E_QUEUE_FULL",
  "E_NODE_NOT_FOUND",
  "E_NODE_VERSION_CONFLICT",
  "E_EXEC_TOO_LARGE",
  "E_EXEC_REJECTED",
  "E_EXEC_BUDGET_EXCEEDED",
  "E_EXEC_TIMEOUT",
  "E_FIGMA_FORMAT_UNSUPPORTED",
  "E_FIGMA_SCALE_OUT_OF_RANGE",
  "E_FIGMA_COLOR_INVALID",
  "E_FIGMA_FONT_FAILED",
  "E_FIGMA_MIXED",
  "E_PARAM_INVALID",
  "E_UNKNOWN",
] as const;

export type WidgetErrorCode = (typeof WIDGET_ERROR_CODES)[number];

export interface WidgetError {
  code: WidgetErrorCode;
  message: string;
  retryable: boolean;
  detail?: Record<string, unknown>;
  cause?: { name?: string; message?: string; stack?: string };
}

export function makeError(
  code: WidgetErrorCode,
  message: string,
  options: { retryable?: boolean; detail?: Record<string, unknown>; cause?: unknown } = {},
): WidgetError {
  const err: WidgetError = {
    code,
    message,
    retryable: options.retryable ?? isRetryableByDefault(code),
  };
  if (options.detail) err.detail = options.detail;
  if (options.cause) err.cause = normalizeCause(options.cause);
  return err;
}

export function fromUnknown(value: unknown, fallbackCode: WidgetErrorCode = "E_UNKNOWN"): WidgetError {
  if (isWidgetError(value)) return value;
  if (value instanceof Error) {
    return {
      code: fallbackCode,
      message: value.message,
      retryable: isRetryableByDefault(fallbackCode),
      cause: { name: value.name, message: value.message, stack: value.stack },
    };
  }
  return {
    code: fallbackCode,
    message: typeof value === "string" ? value : "unknown error",
    retryable: isRetryableByDefault(fallbackCode),
  };
}

export function isWidgetError(value: unknown): value is WidgetError {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<WidgetError>;
  return (
    typeof v.code === "string" &&
    (WIDGET_ERROR_CODES as readonly string[]).includes(v.code) &&
    typeof v.message === "string" &&
    typeof v.retryable === "boolean"
  );
}

export type Result<T, E = WidgetError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<E = WidgetError>(error: E): Result<never, E> {
  return { ok: false, error };
}

function isRetryableByDefault(code: WidgetErrorCode): boolean {
  switch (code) {
    case "E_TIMEOUT":
    case "E_BRIDGE_DISCONNECTED":
    case "E_BRIDGE_UNREACHABLE":
    case "E_BRIDGE_SEND_FAILED":
    case "E_QUEUE_FULL":
      return true;
    default:
      return false;
  }
}

function normalizeCause(value: unknown): WidgetError["cause"] {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value && typeof value === "object") {
    const v = value as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof v.name === "string" ? v.name : undefined,
      message: typeof v.message === "string" ? v.message : undefined,
      stack: typeof v.stack === "string" ? v.stack : undefined,
    };
  }
  return { message: typeof value === "string" ? value : undefined };
}
