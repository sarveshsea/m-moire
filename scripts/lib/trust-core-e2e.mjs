import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
  win32 as win32Path,
} from "node:path";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;
const SUBPROCESS_ENV_ALLOWLIST = new Set([
  "ALL_PROXY",
  "COMSPEC",
  "ComSpec",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "LOCALAPPDATA",
  "NODE_EXTRA_CA_CERTS",
  "NO_PROXY",
  "PATH",
  "PATHEXT",
  "SSL_CERT_DIR",
  "SSL_CERT_FILE",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "WINDIR",
]);

export function npmExecutable(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function resolveNpmInvocation(options = {}) {
  const platform = options.platform ?? process.platform;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const npmExecPath = Object.hasOwn(options, "npmExecPath")
    ? options.npmExecPath
    : process.env.npm_execpath;
  if (npmExecPath) {
    return { command: nodeExecutable, prefix: [npmExecPath] };
  }
  if (platform === "win32") {
    return {
      command: nodeExecutable,
      prefix: [win32Path.join(
        win32Path.dirname(nodeExecutable),
        "node_modules",
        "npm",
        "bin",
        "npm-cli.js",
      )],
    };
  }
  return { command: npmExecutable(platform), prefix: [] };
}

export async function runProcess(command, args, options = {}) {
  const timeoutMs = positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, "timeout");
  const maxOutputBytes = positiveInteger(
    options.maxOutputBytes,
    DEFAULT_MAX_OUTPUT_BYTES,
    "output limit",
  );
  const spawnProcess = options.spawnProcess ?? spawn;

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawnProcess(command, args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let outputBytes = 0;
    let terminalError;
    let settled = false;

    const terminate = (error) => {
      if (terminalError) return;
      terminalError = error;
      child.kill("SIGKILL");
    };

    const capture = (stream, chunk) => {
      const bytes = Buffer.byteLength(chunk);
      outputBytes += bytes;
      if (outputBytes > maxOutputBytes) {
        terminate(new Error(
          `${command} exceeded output limit of ${maxOutputBytes} bytes`,
        ));
        return stream;
      }
      return stream + chunk.toString();
    };

    child.stdout.on("data", (chunk) => {
      stdout = capture(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = capture(stderr, chunk);
      try { options.onStderr?.(chunk); } catch {
        terminate(new Error("subprocess stderr observer failed"));
      }
    });

    const timer = setTimeout(() => {
      terminate(Object.assign(new Error(`${options.label ?? command} timed out after ${timeoutMs}ms`), { code: "MEMI_PROCESS_TIMEOUT" }));
    }, timeoutMs);
    timer.unref?.();

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };

    child.once("error", (error) => {
      terminalError ??= error;
    });
    child.once("close", (exitCode, signal) => {
      if (terminalError) {
        finish(rejectPromise, terminalError);
        return;
      }
      finish(resolvePromise, {
        exitCode: exitCode ?? 1,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

const NPM_TIMING_PHASES = new Set([
  "npm", "command", "idealTree", "reify", "reifyNode", "build", "load",
]);

const NPM_ERROR_CODES = new Set([
  "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ECONNRESET", "ETARGET", "ENOENT", "EPERM", "EACCES",
]);

function npmProgressCollector() {
  const timingsMs = {}, httpStatusCounts = {};
  const cache = { hit: 0, miss: 0, revalidated: 0 };
  let pending = "", dropping = false, droppedLines = 0, lastCompletedPhase = null;
  const errorCodes = new Set();
  const parse = (line) => {
    const timing = /^npm timing ([A-Za-z]+)(?::\S+)? Completed in (\d+)ms\r?$/.exec(line);
    if (timing && NPM_TIMING_PHASES.has(timing[1])) {
      const duration = Number(timing[2]);
      if (Number.isSafeInteger(duration)) {
        timingsMs[timing[1]] = duration;
        lastCompletedPhase = timing[1];
      }
    }
    const errorCode = /^npm (?:error|ERR!) code ([A-Z_]+)\r?$/.exec(line);
    if (errorCode && NPM_ERROR_CODES.has(errorCode[1])) errorCodes.add(errorCode[1]);
    if (!line.startsWith("npm http ")) return;
    const status = /^npm http fetch (?:GET|POST|PUT|DELETE|HEAD) ([1-5]\d{2}) /.exec(line);
    if (status) httpStatusCounts[status[1]] = (httpStatusCounts[status[1]] ?? 0) + 1;
    const cached = /\(cache (hit|miss|revalidated)\)/.exec(line);
    if (cached) cache[cached[1]] += 1;
  };
  return {
    feed(chunk) {
      for (const char of chunk.toString()) {
        if (char === "\n") {
          if (!dropping) parse(pending);
          pending = ""; dropping = false;
        } else if (!dropping) {
          if (pending.length >= 8192) { pending = ""; dropping = true; droppedLines += 1; }
          else pending += char;
        }
      }
    },
    finish() {
      if (pending && !dropping) parse(pending);
      pending = "";
      return { timingsMs: { ...timingsMs }, httpStatusCounts: { ...httpStatusCounts }, cache: { ...cache }, droppedLines, lastCompletedPhase, errorCodes: [...errorCodes] };
    },
  };
}

export async function runNpmInstall(command, args, options = {}) {
  if (!["packed", "baseline", "candidate"].includes(options.phase)) throw new Error("invalid npm install phase");
  const progress = npmProgressCollector(), started = Date.now();
  let result, failure;
  try {
    result = await runProcess(command, [...args, "--timing", "--loglevel=http", "--color=false"], {
      ...options, timeoutMs: options.timeoutMs ?? 180_000, onStderr: (chunk) => progress.feed(chunk),
    });
  } catch (error) { failure = error; }
  if (!failure && result.exitCode === 0) return result;
  const diagnostics = {
    phase: options.phase,
    outcome: failure?.code === "MEMI_PROCESS_TIMEOUT" ? "timeout" : failure ? "process-error" : "exit",
    exitCode: result?.exitCode ?? null,
    elapsedMs: Math.max(0, Date.now() - started),
    ...progress.finish(),
  };
  const label = { packed: "packed artifact install", baseline: "explicit baseline upgrade install", candidate: "explicit candidate upgrade install" }[options.phase];
  throw Object.assign(new Error(`${label} failed: ${JSON.stringify(diagnostics)}`), { diagnostics });
}

export function assertCapabilityDenied(result, expected) {
  if (result.exitCode === 0) {
    throw new Error(`${expected.operation} unexpectedly succeeded in a denied capability profile`);
  }

  const parsed = parseStructuredOutput(result.stderr) ?? parseStructuredOutput(result.stdout);
  const payload = parsed?.error && typeof parsed.error === "object" ? parsed.error : parsed;
  if (
    payload?.code !== "MEMI_CAPABILITY_DENIED"
    || payload?.operation !== expected.operation
    || payload?.capability !== expected.capability
  ) {
    throw new Error(
      `${expected.operation} did not emit a structured MEMI_CAPABILITY_DENIED error for ${expected.capability}`,
    );
  }
  return payload;
}

export function assertMetadataOnlyReceipt(receiptText, canaries = {}) {
  let payload;
  try {
    payload = JSON.parse(receiptText);
  } catch {
    throw new Error("metadata-only receipt must be one valid JSON value");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("metadata-only receipt must be a JSON object");
  }

  const serialized = JSON.stringify(payload);
  const forbidden = [
    ...(canaries.secrets ?? []),
    ...(canaries.privatePaths ?? []),
    ...(canaries.sourceSnippets ?? []),
    ...(canaries.prompts ?? []),
  ].filter((value) => typeof value === "string" && value.length > 0);

  const leaked = forbidden.find((value) => serialized.includes(value));
  if (leaked) {
    throw new Error("metadata-only receipt disclosed a private canary value");
  }
  return payload;
}

export async function assertPathContained(memiRoot, candidate) {
  if (!isAbsolute(candidate)) {
    throw new Error("receipt output must be an absolute path under .memi");
  }

  const lexicalRoot = resolve(memiRoot);
  const canonicalRoot = await realpath(lexicalRoot);
  const absoluteCandidate = resolve(candidate);
  const lexicalRelative = relative(lexicalRoot, absoluteCandidate);
  if (isOutside(lexicalRelative)) {
    throw new Error("receipt output escapes .memi");
  }
  const canonicalCandidate = join(canonicalRoot, lexicalRelative);

  const segments = lexicalRelative.split(sep).filter(Boolean);
  let cursor = canonicalRoot;
  for (const segment of segments) {
    cursor = join(cursor, segment);
    try {
      const metadata = await lstat(cursor);
      if (metadata.isSymbolicLink()) {
        throw new Error("receipt output traverses a symlink under .memi");
      }
    } catch (error) {
      if (error?.code === "ENOENT") break;
      throw error;
    }
  }
  return canonicalCandidate;
}

export async function createPackedInstallation(options = {}) {
  const packageRoot = resolve(options.packageRoot ?? process.cwd());
  const tempRoot = await mkdtemp(join(tmpdir(), "memi-trust-artifact-"));
  const consumerRoot = join(tempRoot, "consumer");
  const npm = resolveNpmInvocation();
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

  try {
    // Use the invoking project context, not the generated package stage: its
    // .npmrc may provide the cache restored earlier in the workflow.
    const env = await resolveInstallHarnessEnvironment(process.env, { npm });
    await mkdir(consumerRoot, { recursive: true });
    await writeFile(join(consumerRoot, "package.json"), `${JSON.stringify({
      name: "memi-trust-core-consumer",
      private: true,
    }, null, 2)}\n`, "utf8");

    let artifact = options.artifact ? resolve(options.artifact) : undefined;
    if (!artifact) {
      const pack = await runProcess(npm.command, [
        ...npm.prefix,
        "pack",
        "--ignore-scripts",
        "--json",
        "--pack-destination",
        tempRoot,
      ], {
        cwd: packageRoot,
        env,
        timeoutMs: 120_000,
        label: "packed artifact pack",
      });
      requireSuccess(pack, "npm pack");
      const result = parseStructuredOutput(pack.stdout);
      const record = Array.isArray(result) ? result[0] : result;
      if (!record?.filename || typeof record.filename !== "string") {
        throw new Error("npm pack did not produce an artifact filename");
      }
      artifact = join(tempRoot, record.filename);
    }

    await runNpmInstall(npm.command, [
      ...npm.prefix,
      "install",
      "--prefer-offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--save-exact",
      artifact,
    ], {
      cwd: consumerRoot,
      env,
      timeoutMs: 180_000,
      label: "packed artifact install",
      phase: "packed",
    });


    const packageName = String(packageJson.name);
    const installedRoot = join(consumerRoot, "node_modules", ...packageName.split("/"));
    const installedPackage = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
    const binaryTarget = typeof installedPackage.bin === "string"
      ? installedPackage.bin
      : installedPackage.bin?.memi;
    if (typeof binaryTarget !== "string") {
      throw new Error("packed artifact does not expose the memi binary");
    }

    return {
      artifact,
      binary: join(installedRoot, binaryTarget),
      consumerRoot,
      packageRoot,
      tempRoot,
      version: String(installedPackage.version),
      async cleanup() {
        await rm(tempRoot, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

// Resolve npmrc/default configuration while the original home and cwd are intact.
// Only the effective cache path crosses into the sanitized installer environment.
export async function resolveInstallHarnessEnvironment(source, options = {}) {
  const npm = options.npm ?? resolveNpmInvocation();
  let result;
  try {
    result = await runProcess(npm.command, [
      ...npm.prefix, "config", "get", "cache",
    ], {
      cwd: options.cwd ?? process.cwd(),
      env: source,
      timeoutMs: Math.min(options.timeoutMs ?? 10_000, 10_000),
      maxOutputBytes: 16_384,
      label: "npm install cache configuration",
    });
  } catch {
    throw new Error("npm install cache configuration failed");
  }
  const cache = result.stdout.trim();
  if (result.exitCode !== 0 || !isAbsolute(cache) || /[\r\n\0]/.test(cache)) {
    throw new Error("npm did not resolve a valid absolute install cache path");
  }
  return { ...cleanHarnessEnvironment(source), npm_config_cache: cache };
}

// Cache configuration belongs to package installation, never the locked runtime.
export function installHarnessEnvironment(source) {
  const cache = Object.entries(source).find(([key, value]) =>
    key.toLowerCase() === "npm_config_cache" && typeof value === "string" && value.length > 0,
  )?.[1];
  return {
    ...cleanHarnessEnvironment(source),
    ...(cache ? { npm_config_cache: cache } : {}),
  };
}

export function cleanHarnessEnvironment(source) {
  const preserved = Object.fromEntries(
    Object.entries(source).filter(([key]) => SUBPROCESS_ENV_ALLOWLIST.has(key)),
  );
  return {
    ...preserved,
    CI: "1",
    MEMI_TELEMETRY_DISABLED: "1",
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_ignore_scripts: "true",
    npm_config_update_notifier: "false",
  };
}

function parseStructuredOutput(text) {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const line of trimmed.split(/\r?\n/).reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        // Keep searching for the final structured line.
      }
    }
    return undefined;
  }
}

function requireSuccess(result, label) {
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit ${result.exitCode}: ${result.stderr || result.stdout}`);
  }
}

function positiveInteger(value, fallback, label) {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return resolved;
}

function isOutside(path) {
  return path === ".." || path.startsWith(`..${sep}`) || isAbsolute(path);
}
