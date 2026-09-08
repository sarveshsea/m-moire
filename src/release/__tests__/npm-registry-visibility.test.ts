// @ts-nocheck
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const packageName = "@memi-design/cli";
const expectedVersion = "2.8.0-beta.2";
const integrity = `sha512-${Buffer.alloc(64, 7).toString("base64")}`;
const shasum = "a".repeat(40);
const version = () => ({ name: packageName, version: expectedVersion, dist: { integrity, shasum } });
const packument = () => ({ name: packageName, versions: { [expectedVersion]: version() } });
const json = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
const load = () => import(pathToFileURL(resolve("scripts/wait-npm-visibility.mjs")).href);
afterEach(() => vi.useRealTimers());

function harness(responses) {
  let elapsed = 0;
  const fetchImpl = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next ?? new Response("not yet", { status: 404 });
  });
  const sleep = vi.fn(async (ms) => { elapsed += ms; });
  return { fetchImpl, sleep, now: () => elapsed };
}

describe("post-publish npm registry visibility", () => {
  it("places the metadata gate after the single publication and before signature installation", async () => {
    const workflow = await readFile(".github/workflows/publish.yml", "utf8");
    const gate = workflow.indexOf("node scripts/wait-npm-visibility.mjs");
    expect(gate).toBeGreaterThan(workflow.indexOf("npm publish --access public"));
    expect(gate).toBeLessThan(workflow.indexOf('npm install --ignore-scripts "${PACKAGE_SPEC}"'));
    expect(workflow.match(/npm publish --access public/g)).toHaveLength(1);
    const step = workflow.split(/^ {6}- /m).find((value) => value.includes("node scripts/wait-npm-visibility.mjs"));
    expect(step).not.toMatch(/^\s+if:|continue-on-error|\|\|\s*true/m);
    expect(workflow).toContain("npm audit signatures --include-attestations");
    const signatureStep = workflow.split(/^ {6}- /m).find((value) => value.startsWith("name: Verify npm signatures"));
    expect(signatureStep).toContain("NPM_CONFIG_PREFER_ONLINE: 'true'");
    expect(workflow).toContain("run: node scripts/verify-npm-release.mjs\n");
  });

  it("checks exact-version and installation metadata against the same canonical integrity", async () => {
    const { waitForNpmVisibility } = await load();
    const deps = harness([json(version()), json(packument())]);
    expect(await waitForNpmVisibility({ packageName, expectedVersion }, deps)).toEqual({
      status: "visible", packageName, version: expectedVersion, integrity, shasum, attempts: 1,
    });
    const calls = deps.fetchImpl.mock.calls;
    expect(calls[0][0]).toBe("https://registry.npmjs.org/%40memi-design%2Fcli/2.8.0-beta.2");
    expect(calls[1][0]).toBe("https://registry.npmjs.org/%40memi-design%2Fcli");
    expect(calls[1][1].headers.Accept).toBe("application/vnd.npm.install-v1+json");
    for (const [, options] of calls) {
      expect(options.redirect).toBe("error");
      expect(options.signal).toBeInstanceOf(AbortSignal);
      expect(options.headers["Cache-Control"]).toBe("no-cache");
    }
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it("waits for a missing version in both representations without installing or publishing", async () => {
    const { waitForNpmVisibility } = await load();
    const deps = harness([
      new Response("missing", { status: 404 }),
      json(version()), json({ name: packageName, versions: {} }),
      json(version()), json(packument()),
    ]);
    expect((await waitForNpmVisibility({ packageName, expectedVersion }, deps)).attempts).toBe(3);
    expect(deps.sleep.mock.calls).toEqual([[5000], [5000]]);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(5);
  });

  it.each([408, 429, 500, 503])("retries transient HTTP %s within the same visibility budget", async (status) => {
    const { waitForNpmVisibility } = await load();
    const deps = harness([new Response("temporary", { status }), json(version()), json(packument())]);
    expect((await waitForNpmVisibility({ packageName, expectedVersion }, deps)).attempts).toBe(2);
  });

  it.each([401, 403, 400])("fails HTTP %s immediately instead of retrying authentication or invalid requests", async (status) => {
    const { waitForNpmVisibility } = await load();
    const deps = harness([new Response("private details", { status })]);
    await expect(waitForNpmVisibility({ packageName, expectedVersion }, deps)).rejects.toThrow(`HTTP ${status}`);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it("retries an allowlisted network reset but not unknown failures", async () => {
    const { waitForNpmVisibility } = await load();
    const reset = new TypeError("credential-bearing URL must not leak", { cause: { code: "ECONNRESET" } });
    const deps = harness([reset, json(version()), json(packument())]);
    expect((await waitForNpmVisibility({ packageName, expectedVersion }, deps)).attempts).toBe(2);
    const unknown = harness([new Error("private path")]);
    await expect(waitForNpmVisibility({ packageName, expectedVersion }, unknown)).rejects.toThrow("Registry request failed");
    expect(unknown.sleep).not.toHaveBeenCalled();
  });

  it("rejects wrong version, malformed digest, and conflicting representations immediately", async () => {
    const { waitForNpmVisibility } = await load();
    for (const value of [
      { ...version(), version: "2.7.9" },
      { ...version(), name: "wrong-package" },
      { ...version(), dist: { integrity: "sha512-AAAA", shasum } },
      { ...version(), dist: { integrity, shasum: "invalid" } },
    ]) {
      const deps = harness([json(value)]);
      await expect(waitForNpmVisibility({ packageName, expectedVersion }, deps)).rejects.toThrow(/identity|integrity/);
      expect(deps.sleep).not.toHaveBeenCalled();
    }
    const conflicting = packument();
    conflicting.versions[expectedVersion].dist.integrity = `sha512-${Buffer.alloc(64, 8).toString("base64")}`;
    const deps = harness([json(version()), json(conflicting)]);
    await expect(waitForNpmVisibility({ packageName, expectedVersion }, deps)).rejects.toThrow("conflicting integrity");
    expect(deps.sleep).not.toHaveBeenCalled();
  });

  it("rejects an exact-version digest changing between visibility attempts", async () => {
    const { waitForNpmVisibility } = await load();
    const changed = { ...version(), dist: { integrity: `sha512-${Buffer.alloc(64, 8).toString("base64")}`, shasum } };
    const deps = harness([json(version()), json({ name: packageName, versions: {} }), json(changed)]);
    await expect(waitForNpmVisibility({ packageName, expectedVersion }, deps)).rejects.toThrow("conflicting integrity");
    expect(deps.fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed or oversized metadata without retrying", async () => {
    const { waitForNpmVisibility } = await load();
    for (const response of [new Response("not-json"), new Response("x".repeat(8 * 1024 * 1024 + 1))]) {
      const deps = harness([response]);
      await expect(waitForNpmVisibility({ packageName, expectedVersion }, deps)).rejects.toThrow(/metadata|byte limit/);
      expect(deps.sleep).not.toHaveBeenCalled();
    }
  });

  it("caps missing-version retries at twelve with an explicit visibility failure", async () => {
    const { waitForNpmVisibility } = await load();
    const deps = harness([]);
    await expect(waitForNpmVisibility({ packageName, expectedVersion }, deps)).rejects.toThrow("not visible");
    expect(deps.fetchImpl).toHaveBeenCalledTimes(12);
    expect(deps.sleep).toHaveBeenCalledTimes(11);
    expect(deps.now()).toBe(55_000);
  });

  it("enforces the ninety-second wall-clock deadline even with slow metadata requests", async () => {
    const { waitForNpmVisibility } = await load();
    vi.useFakeTimers();
    const signals = [];
    const fetchImpl = vi.fn((_url, options) => { signals.push(options.signal); return new Promise(() => {}); });
    const pending = waitForNpmVisibility({ packageName, expectedVersion }, { fetchImpl });
    const assertion = expect(pending).rejects.toThrow("not visible");
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(12);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("validates package/version input before requesting a registry URL", async () => {
    const { waitForNpmVisibility } = await load();
    for (const input of [
      { packageName: "https://elsewhere.invalid", expectedVersion },
      { packageName, expectedVersion: "latest" },
      { packageName, expectedVersion: "../2.8.0" },
    ]) {
      const deps = harness([]);
      await expect(waitForNpmVisibility(input, deps)).rejects.toThrow("Invalid");
      expect(deps.fetchImpl).not.toHaveBeenCalled();
    }
  });
});
