import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Header, Parser } from "tar";
import { validateTarballBytes } from "./release-manifest.mjs";

export const DEFAULT_README_PHRASE =
  "The design layer for agentic AI.";
export const SLSA_PROVENANCE_V1 = "https://slsa.dev/provenance/v1";

const NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org";
const IN_TOTO_STATEMENT_V1 = "https://in-toto.io/Statement/v1";
const IN_TOTO_PAYLOAD_TYPE = "application/vnd.in-toto+json";
const GITHUB_HOSTED_BUILDER = "https://github.com/actions/runner/github-hosted";
const COMMIT_SHA = /^[0-9a-f]{40}$/;
const SHASUM = /^[0-9a-f]{40}$/;
const STABLE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const NUMERIC_IDENTIFIER = "(?:0|[1-9]\\d*)";
const PRERELEASE_IDENTIFIER =
  `(?:${NUMERIC_IDENTIFIER}|\\d*[A-Za-z-][0-9A-Za-z-]*)`;
const SEMVER = new RegExp(
  `^${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}\\.${NUMERIC_IDENTIFIER}`
  + `(?:-(?<prerelease>${PRERELEASE_IDENTIFIER}(?:\\.${PRERELEASE_IDENTIFIER})*))?`
  + "(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
);

export function resolveReleaseChannel({ version, previousPublicRelease }) {
  const match = typeof version === "string" ? SEMVER.exec(version) : null;
  if (!match) {
    throw new Error(`unsupported release version: ${version}`);
  }

  const isPrerelease = match.groups?.prerelease !== undefined;
  if (isPrerelease) {
    if (typeof previousPublicRelease !== "string"
      || !STABLE_VERSION.test(previousPublicRelease)) {
      throw new Error(
        "prerelease routing requires a valid stable previousPublicRelease",
      );
    }
    return {
      version,
      distTag: "next",
      expectedLatest: previousPublicRelease,
      isPrerelease: true,
      githubPrerelease: true,
      githubMakeLatest: "false",
      promoteStableChannels: false,
    };
  }

  if (STABLE_VERSION.test(version)) {
    return {
      version,
      distTag: "latest",
      expectedLatest: version,
      isPrerelease: false,
      githubPrerelease: false,
      githubMakeLatest: "legacy",
      promoteStableChannels: true,
    };
  }

  throw new Error(`unsupported release version: ${version}`);
}

export function resolveNpmReleaseChannel(expectedVersion, previousPublicRelease) {
  return resolveReleaseChannel({
    version: expectedVersion,
    previousPublicRelease,
  });
}

export function validateRegistryVersion(input) {
  const registry = validateRegistryMetadata(input);
  const readme = `${input.metadata.readme || ""}\n${input.metadata.versions?.[input.expectedVersion]?.readme || ""}`;
  validateReadmeContent(readme, input.expectedPhrase, input.expectedInstall);
  return registry;
}

function validateReadmeContent(readme, expectedPhrase, expectedInstall) {
  assert(normalizeReadableMarkdown(readme).includes(normalizeReadableMarkdown(expectedPhrase)), `README missing phrase: ${expectedPhrase}`);
  assert(readme.includes(expectedInstall), `README missing install command: ${expectedInstall}`);
}

function validateTarFraming(bytes) {
  let offset = 0;
  let entries = 0;
  while (offset + 512 <= bytes.length) {
    const block = bytes.subarray(offset, offset + 512);
    if (block.every(byte => byte === 0)) {
      assert(bytes.length - offset >= 1024 && bytes.subarray(offset).every(byte => byte === 0), "invalid archive end marker or trailing content");
      return;
    }
    const header = new Header(bytes, offset);
    assert(header.cksumValid, "invalid archive header checksum");
    assert(Number.isSafeInteger(header.size) && header.size >= 0, "invalid archive entry size");
    entries += 1;
    assert(entries <= 20000, "archive entry limit exceeded");
    offset += 512 + Math.ceil(header.size / 512) * 512;
    assert(offset <= bytes.length, "truncated archive entry body");
  }
  throw new Error("archive missing end marker");
}

/** Read version-bound documentation in memory, only after verifying archive integrity. */
export async function validatePublishedTarballReadme({ bytes, integrity, shasum, expectedPhrase, expectedInstall }) {
  const digests = validateTarballBytes({ bytes, integrity, shasum });
  const unpacked = gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 });
  validateTarFraming(unpacked);
  const readmePath = "package/README.md";
  const maxReadmeBytes = 512 * 1024;
  let readme;
  let entries = 0;
  await new Promise((resolve, reject) => {
    const parser = new Parser({ strict: true, maxMetaEntrySize: maxReadmeBytes });
    parser.on("error", reject);
    parser.on("end", resolve);
    parser.on("entry", entry => {
      try {
        entries += 1;
        assert(entries <= 20000, "archive entry limit exceeded");
        const path = entry.path;
        const parts = path.replace(/\/$/, "").split("/");
        assert(parts[0] === "package" && !path.includes("\\") && !path.includes("\0")
          && parts.every(part => part !== ".." && part !== "." && part !== ""), "unsafe archive path");
        assert(entry.type === "File" || entry.type === "Directory", "archive entries must be regular files or directories");
        if (path !== readmePath) { entry.resume(); return; }
        assert(entry.type === "File", "README must be a regular file");
        assert(readme === undefined, "duplicate README archive entry");
        assert(Number.isSafeInteger(entry.size) && entry.size >= 0 && entry.size <= maxReadmeBytes, "README exceeds size limit");
        readme = Buffer.alloc(0);
        const chunks = [];
        let length = 0;
        entry.on("data", chunk => {
          length += chunk.length;
          if (length > maxReadmeBytes) { parser.abort(new Error("README exceeds size limit")); return; }
          chunks.push(chunk);
        });
        entry.on("end", () => {
          if (length !== entry.size) { parser.abort(new Error("truncated README archive entry")); return; }
          readme = Buffer.concat(chunks);
        });
      } catch (error) { parser.abort(error); }
    });
    parser.end(unpacked);
  });
  assert(readme !== undefined, "README missing from package archive");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(readme);
  validateReadmeContent(text, expectedPhrase, expectedInstall);
  return { ...digests, readmePath, readmeSha256: createHash("sha256").update(readme).digest("hex") };
}

export function validateRegistryMetadata({
  metadata,
  packageName,
  expectedVersion,
  expectedDistTag = "latest",
  expectedLatest = expectedVersion,
  requireProvenance = true,
}) {
  assert(metadata && typeof metadata === "object", "registry metadata must be an object");
  const latest = metadata["dist-tags"]?.latest;
  const taggedVersion = metadata["dist-tags"]?.[expectedDistTag];
  const version = metadata.versions?.[expectedVersion];
  const dist = version?.dist;

  assert(
    expectedDistTag === "latest" || expectedDistTag === "next",
    `unsupported npm dist-tag: ${expectedDistTag}`,
  );
  assert(
    taggedVersion === expectedVersion,
    `expected ${expectedDistTag} ${expectedVersion}, got ${taggedVersion}`,
  );
  assert(latest === expectedLatest, `expected latest ${expectedLatest}, got ${latest}`);
  assert(
    typeof dist?.integrity === "string" && /^sha512-[A-Za-z0-9+/]+={0,2}$/.test(dist.integrity),
    "published package is missing a valid sha512 integrity value",
  );
  assert(
    typeof dist?.shasum === "string" && SHASUM.test(dist.shasum),
    "published package is missing a valid sha1 shasum",
  );
  assert(
    Array.isArray(dist?.signatures)
      && dist.signatures.some((signature) => signature?.keyid && signature?.sig),
    "published package is missing an npm registry signature",
  );

  let attestationUrl = "";
  if (requireProvenance) {
    assert(
      dist?.attestations?.provenance?.predicateType === SLSA_PROVENANCE_V1,
      "published package is missing SLSA v1 provenance metadata",
    );
    attestationUrl = assertRegistryAttestationUrl(dist?.attestations?.url);
  }

  return {
    packageName,
    distTag: expectedDistTag,
    latest,
    integrity: dist.integrity,
    shasum: dist.shasum,
    signatureCount: dist.signatures.length,
    attestationUrl,
  };
}

function normalizeReadableMarkdown(value) {
  return String(value)
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function assertRegistryAttestationUrl(value) {
  assert(typeof value === "string" && value.length > 0, "npm attestation URL is missing");
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("npm attestation URL is invalid");
  }
  assert(
    url.origin === NPM_REGISTRY_ORIGIN,
    "npm attestation URL must use https://registry.npmjs.org",
  );
  assert(
    url.pathname.startsWith("/-/npm/v1/attestations/"),
    "npm attestation URL must use the registry attestation endpoint",
  );
  assert(!url.username && !url.password, "npm attestation URL must not contain credentials");
  return url.href;
}

export function validateProvenanceAttestations({
  payload,
  packageName,
  expectedVersion,
  expectedIntegrity,
  expectedRepository,
  expectedWorkflowPath,
  expectedWorkflowRef = "refs/heads/main",
  expectedSourceCommit,
}) {
  assert(COMMIT_SHA.test(expectedSourceCommit), "expected source commit must be an exact SHA");
  const attestations = payload?.attestations;
  assert(Array.isArray(attestations), "npm attestation response is missing attestations");
  const provenance = attestations.find(
    (attestation) => attestation?.predicateType === SLSA_PROVENANCE_V1,
  );
  assert(provenance, "npm attestation response is missing SLSA v1 provenance");

  const envelope = provenance.bundle?.dsseEnvelope;
  assert(envelope?.payloadType === IN_TOTO_PAYLOAD_TYPE, "provenance payload type is invalid");
  assert(
    Array.isArray(envelope?.signatures) && envelope.signatures.length > 0,
    "provenance envelope is missing a signature",
  );

  const statement = decodeStatement(envelope.payload);
  assert(statement?._type === IN_TOTO_STATEMENT_V1, "provenance statement type is invalid");
  assert(statement?.predicateType === SLSA_PROVENANCE_V1, "provenance predicate type is invalid");

  const expectedSubject = npmPackagePurl(packageName, expectedVersion);
  const expectedSha512 = integritySha512Hex(expectedIntegrity);
  const subject = statement.subject?.find((candidate) => candidate?.name === expectedSubject);
  assert(subject, `provenance subject does not identify ${expectedSubject}`);
  assert(
    subject.digest?.sha512 === expectedSha512,
    "provenance subject digest does not match registry integrity",
  );

  const buildDefinition = statement.predicate?.buildDefinition;
  const workflow = buildDefinition?.externalParameters?.workflow;
  const normalizedWorkflowPath = String(workflow?.path || "").replace(/^\/+/, "");
  assert(workflow?.repository === expectedRepository, "provenance repository is incorrect");
  assert(normalizedWorkflowPath === expectedWorkflowPath, "provenance workflow path is incorrect");
  assert(workflow?.ref === expectedWorkflowRef, "provenance workflow ref is incorrect");
  assert(
    statement.predicate?.runDetails?.builder?.id === GITHUB_HOSTED_BUILDER,
    "provenance builder is not GitHub-hosted Actions",
  );

  const resolvedDependencies = buildDefinition?.resolvedDependencies;
  assert(Array.isArray(resolvedDependencies), "provenance resolved dependencies are missing");
  const source = resolvedDependencies.find(
    (dependency) => dependency?.digest?.gitCommit === expectedSourceCommit,
  );
  assert(source, `provenance does not resolve source commit ${expectedSourceCommit}`);
  assert(
    typeof source.uri === "string" && source.uri.startsWith(`git+${expectedRepository}@`),
    "provenance source repository is incorrect",
  );

  return {
    packageName,
    version: expectedVersion,
    repository: expectedRepository,
    workflowPath: normalizedWorkflowPath,
    workflowRef: expectedWorkflowRef,
    sourceCommit: expectedSourceCommit,
    subject: expectedSubject,
    sha512: expectedSha512,
  };
}

export function extractProvenanceInvocation({ payload, expectedRepository }) {
  const attestations = payload?.attestations;
  assert(Array.isArray(attestations), "npm attestation response is missing attestations");
  const provenance = attestations.find(
    (attestation) => attestation?.predicateType === SLSA_PROVENANCE_V1,
  );
  assert(provenance, "npm attestation response is missing SLSA v1 provenance");

  const statement = decodeStatement(provenance.bundle?.dsseEnvelope?.payload);
  const invocationId = statement?.predicate?.runDetails?.metadata?.invocationId;
  let repository;
  let invocation;
  try {
    repository = new URL(expectedRepository);
    invocation = new URL(invocationId);
  } catch {
    throw new Error(
      "SLSA provenance invocation does not identify the expected workflow run attempt",
    );
  }

  const repositoryPath = repository.pathname.replace(/\/+$/, "");
  const expectedInvocationPath = new RegExp(
    `^${escapeRegExp(repositoryPath)}/actions/runs/\\d+/attempts/[1-9]\\d*$`,
  );
  assert(
    repository.origin === "https://github.com"
      && !repository.username
      && !repository.password
      && !repository.search
      && !repository.hash
      && invocation.origin === repository.origin
      && !invocation.username
      && !invocation.password
      && !invocation.search
      && !invocation.hash
      && expectedInvocationPath.test(invocation.pathname),
    "SLSA provenance invocation does not identify the expected workflow run attempt",
  );
  return invocation.href;
}

function decodeStatement(value) {
  assert(typeof value === "string" && value.length > 0, "provenance payload is missing");
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8"));
  } catch {
    throw new Error("provenance payload is not valid base64-encoded JSON");
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function npmPackagePurl(packageName, version) {
  const encodedName = packageName.startsWith("@")
    ? `%40${packageName.slice(1)}`
    : packageName;
  return `pkg:npm/${encodedName}@${version}`;
}

function integritySha512Hex(integrity) {
  assert(
    typeof integrity === "string" && integrity.startsWith("sha512-"),
    "expected integrity must use sha512",
  );
  const digest = Buffer.from(integrity.slice("sha512-".length), "base64");
  assert(digest.length === 64, "expected integrity has an invalid sha512 digest");
  return digest.toString("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
