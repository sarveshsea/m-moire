import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { Header } from "tar";
import { describe, expect, it } from "vitest";
import * as proof from "../../../scripts/lib/npm-release-verification.mjs";
const phrase = "The design layer for agentic AI.";
const install = "npm i -g @memi-design/cli";
function archive(entries: Array<{path: string; body?: string; type?: string}>) {
  return gzipSync(Buffer.concat([...entries.flatMap(entry => {
    const body = Buffer.from(entry.body ?? "");
    const header = new Header({path: entry.path, size: body.length, type: (entry.type ?? "File") as never, linkpath: entry.type === "Link" || entry.type === "SymbolicLink" ? "package/other" : undefined, mode: 0o644}); header.encode();
    return [header.block!, body, Buffer.alloc((512 - body.length % 512) % 512)];
  }), Buffer.alloc(1024)]));
}
const valid = `${phrase}\n${install}\n`;
function args(bytes: Buffer) { return {bytes, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, shasum: createHash("sha1").update(bytes).digest("hex"), expectedPhrase: phrase, expectedInstall: install}; }
function verify(bytes: Buffer) { return (proof as any).validatePublishedTarballReadme(args(bytes)); }
describe("integrity-bound published README proof", () => {
  it("verifies tarball README even when registry README fields are absent", async () => {
    const bytes = archive([{path: "package/README.md", body: valid}]);
    const input = {metadata: {"dist-tags": {latest: "2.7.9", next: "2.8.0-beta.1"}, readme: "", versions: {"2.8.0-beta.1": {dist: {...args(bytes), signatures: [{keyid: "fixture", sig: "fixture"}], attestations: {url: "https://registry.npmjs.org/-/npm/v1/attestations/fixture", provenance: {predicateType: proof.SLSA_PROVENANCE_V1}}}}}}, packageName: "@memi-design/cli", expectedVersion: "2.8.0-beta.1", expectedDistTag: "next", expectedLatest: "2.7.9"};
    const metadata = ((proof as any).validateRegistryMetadata ?? proof.validateRegistryVersion)({...input, expectedPhrase: phrase, expectedInstall: install});
    expect(metadata.integrity).toBe(args(bytes).integrity);
    expect(await verify(bytes)).toMatchObject({readmePath: "package/README.md", readmeSha256: createHash("sha256").update(valid).digest("hex")});
  });
  it("rejects tampered bytes before README parsing", async () => { const bytes=archive([{path:"package/README.md",body:valid}]); await expect((proof as any).validatePublishedTarballReadme({...args(bytes), integrity:`sha512-${Buffer.alloc(64).toString("base64")}`})).rejects.toThrow(/integrity/i); });
  it.each([phrase, install, ""])("keeps phrase and install requirements for incomplete content %s", async body => { await expect(verify(archive([{path:"package/README.md",body}]))).rejects.toThrow(/README missing/); });
  it.each([[{path:"../README.md",body:valid}], [{path:"package/README.md",type:"SymbolicLink"}], [{path:"package/README.md",body:valid},{path:"package/README.md",body:valid}], [{path:"package/docs/README.md",body:valid}]].map(entries => [entries]))("rejects unsafe, duplicate, or non-root README entries %j", async entries => { await expect(verify(archive(entries))).rejects.toThrow(/README|archive|path/i); });
  it.each(["header", "body", "end", "trailing"])("rejects malformed tar framing: %s", async kind => {
    const raw = gunzipSync(archive([{path:"package/README.md",body:valid}]));
    const damaged = kind === "header" ? Buffer.from(raw) : kind === "body" ? raw.subarray(0, 520) : kind === "end" ? raw.subarray(0, raw.length - 1024) : Buffer.concat([raw, Buffer.from("nonzero trailing content")]);
    if (kind === "header") damaged[0] ^= 1;
    await expect(verify(gzipSync(damaged))).rejects.toThrow();
  });
  it("bounds decompression before parsing entries", async () => { await expect(verify(gzipSync(Buffer.alloc(128*1024*1024+1)))).rejects.toThrow(/larger|length|size|limit/i); });
  it.each(["Link", "Directory"])("rejects README type %s", async type => { await expect(verify(archive([{path:"package/README.md",type,body:valid}]))).rejects.toThrow(/README|archive/i); });
  it("detects duplicate README paths supplied by PAX metadata", async () => {
    const value = "path=package/README.md\n";
    let line = `0 ${value}`;
    while (Number(line.split(" ")[0]) !== Buffer.byteLength(line)) line = `${Buffer.byteLength(line)} ${value}`;
    const bytes = archive([{path:"package/README.md",body:valid}, {path:"package/PaxHeader",type:"ExtendedHeader",body:line}, {path:"package/alias",body:valid}]);
    await expect(verify(bytes)).rejects.toThrow(/duplicate README/);
  });
  it("rejects an oversized README", async () => { await expect(verify(archive([{path:"package/README.md",body:valid+"x".repeat(512*1024)}]))).rejects.toThrow(/limit|large/i); });
});
