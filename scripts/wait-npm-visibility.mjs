#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const REGISTRY = "https://registry.npmjs.org";
const MAX_BYTES = 8 * 1024 * 1024;
const DEADLINE_MS = 90_000;
const REQUEST_MS = 10_000;
const MAX_ATTEMPTS = 12;
const RETRY_DELAY_MS = 5_000;
const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

class RegistryError extends Error {
  constructor(message, retryable = false) {
    super(message);
    this.retryable = retryable;
  }
}

function validateInput(packageName, expectedVersion) {
  const name = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
  const numeric = "(?:0|[1-9]\\d*)";
  const identifier = `(?:${numeric}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
  const version = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?$`);
  if (typeof packageName !== "string" || packageName.length > 214 || !name.test(packageName)) {
    throw new RegistryError("Invalid package name");
  }
  if (typeof expectedVersion !== "string" || expectedVersion.length > 128 || !version.test(expectedVersion)) {
    throw new RegistryError("Invalid exact version");
  }
}

function identity(metadata, packageName, expectedVersion) {
  if (metadata?.name !== packageName || metadata?.version !== expectedVersion) {
    throw new RegistryError("Registry metadata identity mismatch");
  }
  const { integrity, shasum } = metadata.dist ?? {};
  if (typeof integrity !== "string" || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)
    || Buffer.from(integrity.slice(7), "base64").toString("base64") !== integrity.slice(7)
    || typeof shasum !== "string" || !/^[a-f0-9]{40}$/.test(shasum)) {
    throw new RegistryError("Registry metadata integrity is invalid");
  }
  return { integrity, shasum };
}

function assertSameIdentity(expected, actual) {
  if (expected && (expected.integrity !== actual.integrity || expected.shasum !== actual.shasum)) {
    throw new RegistryError("Registry metadata has conflicting integrity");
  }
}

async function requestMetadata(url, accept, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  let reader;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new RegistryError("Registry request timed out", true));
      controller.abort();
      void reader?.cancel().catch(() => {});
    }, timeoutMs);
  });
  const request = async () => {
    const response = await fetchImpl(url, {
      headers: { Accept: accept, "Cache-Control": "no-cache", "User-Agent": "memi-registry-visibility" },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new RegistryError(`Registry returned HTTP ${response.status}`,
        [404, 408, 429].includes(response.status) || (response.status >= 500 && response.status <= 599));
    }
    if (!response.body) throw new RegistryError("Registry metadata body is missing");
    reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new RegistryError("Registry metadata exceeds byte limit");
      }
      chunks.push(Buffer.from(value));
    }
    try {
      return JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
    } catch {
      throw new RegistryError("Registry metadata is not valid JSON");
    }
  };
  try {
    return await Promise.race([request(), timeout]);
  } catch (error) {
    if (error instanceof RegistryError) throw error;
    const code = error?.cause?.code ?? error?.code;
    throw new RegistryError("Registry request failed", TRANSIENT_CODES.has(code));
  } finally {
    clearTimeout(timer);
  }
}

/** Wait for metadata consistency only; the later signature/provenance gates remain authoritative. */
export async function waitForNpmVisibility({ packageName, expectedVersion }, dependencies = {}) {
  validateInput(packageName, expectedVersion);
  const { fetchImpl = globalThis.fetch, now = Date.now,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = dependencies;
  const deadline = now() + DEADLINE_MS;
  const packageUrl = `${REGISTRY}/${encodeURIComponent(packageName)}`;
  let observedIdentity;
  let lastFailure = "version absent";
  const fetchMetadata = async (url, accept) => {
    const remaining = deadline - now();
    if (remaining <= 0) throw new RegistryError("Registry visibility deadline elapsed", true);
    return requestMetadata(url, accept, Math.min(REQUEST_MS, remaining), fetchImpl);
  };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && now() < deadline; attempt += 1) {
    try {
      const exact = await fetchMetadata(`${packageUrl}/${encodeURIComponent(expectedVersion)}`, "application/json");
      const current = identity(exact, packageName, expectedVersion);
      assertSameIdentity(observedIdentity, current);
      observedIdentity = current;
      const install = await fetchMetadata(packageUrl, "application/vnd.npm.install-v1+json");
      if (install?.name !== packageName || !install.versions || typeof install.versions !== "object"
        || Array.isArray(install.versions)) throw new RegistryError("Registry installation metadata is invalid");
      if (!Object.hasOwn(install.versions, expectedVersion)) {
        throw new RegistryError("Registry installation metadata version absent", true);
      }
      assertSameIdentity(observedIdentity, identity(install.versions[expectedVersion], packageName, expectedVersion));
      if (now() >= deadline) break;
      return { status: "visible", packageName, version: expectedVersion, ...current, attempts: attempt };
    } catch (error) {
      if (!(error instanceof RegistryError) || !error.retryable) throw error;
      lastFailure = error.message;
    }
    const remaining = deadline - now();
    if (attempt < MAX_ATTEMPTS && remaining > 0) await sleep(Math.min(RETRY_DELAY_MS, remaining));
  }
  throw new RegistryError(`Exact npm version not visible within bounded wait: ${lastFailure}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await waitForNpmVisibility({ packageName: "@memi-design/cli", expectedVersion: process.env.EXPECTED_VERSION });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(error instanceof RegistryError ? error.message : "Registry visibility check failed");
    process.exitCode = 1;
  }
}
