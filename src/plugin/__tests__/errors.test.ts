import { describe, expect, it } from "vitest";
import {
  err,
  fromUnknown,
  isWidgetError,
  makeError,
  ok,
  WIDGET_ERROR_CODES,
} from "../shared/errors.js";

describe("makeError", () => {
  it("defaults retryable based on code", () => {
    expect(makeError("E_TIMEOUT", "boom").retryable).toBe(true);
    expect(makeError("E_PARAM_INVALID", "bad").retryable).toBe(false);
  });

  it("honors explicit retryable override", () => {
    expect(makeError("E_TIMEOUT", "boom", { retryable: false }).retryable).toBe(false);
    expect(makeError("E_PARAM_INVALID", "bad", { retryable: true }).retryable).toBe(true);
  });

  it("captures detail and cause", () => {
    const cause = new Error("inner");
    const e = makeError("E_UNKNOWN", "wrap", { detail: { nodeId: "x" }, cause });
    expect(e.detail).toEqual({ nodeId: "x" });
    expect(e.cause?.message).toBe("inner");
    expect(e.cause?.name).toBe("Error");
  });
});

describe("fromUnknown", () => {
  it("passes through existing WidgetError", () => {
    const original = makeError("E_TIMEOUT", "x");
    expect(fromUnknown(original)).toBe(original);
  });

  it("wraps Error with stack preserved", () => {
    const native = new Error("native");
    const wrapped = fromUnknown(native, "E_EXEC_REJECTED");
    expect(wrapped.code).toBe("E_EXEC_REJECTED");
    expect(wrapped.message).toBe("native");
    expect(wrapped.cause?.stack).toBe(native.stack);
  });

  it("wraps strings and unknowns", () => {
    expect(fromUnknown("oops").message).toBe("oops");
    expect(fromUnknown(undefined).message).toBe("unknown error");
  });
});

describe("isWidgetError", () => {
  it("validates shape and code enum", () => {
    expect(isWidgetError(makeError("E_UNKNOWN", "x"))).toBe(true);
    expect(isWidgetError({ code: "NOT_A_CODE", message: "x", retryable: false })).toBe(false);
    expect(isWidgetError({ code: "E_UNKNOWN", message: 1, retryable: false })).toBe(false);
    expect(isWidgetError(null)).toBe(false);
  });
});

describe("Result helpers", () => {
  it("ok and err are disjoint", () => {
    const a = ok(42);
    const b = err(makeError("E_UNKNOWN", "x"));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
  });
});

describe("WIDGET_ERROR_CODES", () => {
  it("has no duplicates", () => {
    expect(new Set(WIDGET_ERROR_CODES).size).toBe(WIDGET_ERROR_CODES.length);
  });
});
