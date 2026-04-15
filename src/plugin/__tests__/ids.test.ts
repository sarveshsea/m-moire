import { describe, expect, it } from "vitest";
import { correlationId, isUuidV4, uuidv4 } from "../shared/ids.js";

describe("uuidv4", () => {
  it("produces RFC4122 v4 shapes", () => {
    for (let i = 0; i < 64; i++) {
      const id = uuidv4();
      expect(isUuidV4(id)).toBe(true);
    }
  });

  it("is stable under collision at scale", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(uuidv4());
    expect(seen.size).toBe(10_000);
  });
});

describe("isUuidV4", () => {
  it("rejects non-v4 inputs", () => {
    expect(isUuidV4(undefined)).toBe(false);
    expect(isUuidV4(null)).toBe(false);
    expect(isUuidV4("")).toBe(false);
    expect(isUuidV4("not-a-uuid")).toBe(false);
    // v1-like (time-based)
    expect(isUuidV4("00000000-0000-1000-8000-000000000000")).toBe(false);
    // wrong variant bits
    expect(isUuidV4("00000000-0000-4000-0000-000000000000")).toBe(false);
  });

  it("accepts canonical v4", () => {
    expect(isUuidV4("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toBe(true);
  });
});

describe("correlationId", () => {
  it("prefixes and stays short", () => {
    const id = correlationId("job");
    expect(id.startsWith("job-")).toBe(true);
    expect(id.length).toBe("job-".length + 10);
  });

  it("is unique per call", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(correlationId("x"));
    expect(seen.size).toBe(1000);
  });
});
