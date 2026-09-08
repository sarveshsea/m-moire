import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { Header } from "tar";
import { describe, expect, it } from "vitest";
import * as proof from "../../../scripts/lib/npm-release-verification.mjs";
const phrase = "The design layer for agentic AI.";
const install = "npm i -g @memi-design/cli";
function archive(entries: Array<{path: string; body?: string; type?: string}>) {
  return gzipSync(Buffer.concat([...entries.flatMap(entry => {
    const body = Buffer.from(entry.body ?? "");
    const header = new Header({path: entry.path, size: body.length, type: (entry.type ?? "File") as never, mode: 0o644}); header.encode();
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
  it.each([[{path:"../README.md",body:valid}], [{path:"package/README.md",type:"SymbolicLink"}], [{path:"package/README.md",body:valid},{path:"package/README.md",body:valid}], [{path:"package/docs/README.md",body:valid}]])("rejects unsafe, duplicate, or non-root README entries %j", async entries => { await expect(verify(archive(entries))).rejects.toThrow(/README|archive|path/i); });
  it("rejects an oversized README", async () => { await expect(verify(archive([{path:"package/README.md",body:valid+"x".repeat(512*1024)}]))).rejects.toThrow(/limit|large/i); });
});
