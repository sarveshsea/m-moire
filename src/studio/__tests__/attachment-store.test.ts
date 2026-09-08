import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { captureStudioAttachment, getStudioAttachment } from "../attachment-store.js";

import { configureExecutionPolicy, resetExecutionPolicyForTests } from "../../security/execution-policy.js";

describe("studio attachment store", () => {
  it("captures pasted text material and pasted image files with durable metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "memoire-attachments-"));
    try {
      configureExecutionPolicy({ projectRoot: root, profile: "connected", allow: ["project-write", "source-content-persistence"] });
      await mkdir(root, { recursive: true });
      const text = await captureStudioAttachment(root, {
        kind: "text",
        name: "research-material.txt",
        mimeType: "text/plain",
        source: "paste",
        text: "Long pasted research material for the next agent run.",
      });
      const image = await captureStudioAttachment(root, {
        sessionId: "studio-session-1",
        kind: "image",
        name: "screen.png",
        mimeType: "image/png",
        source: "paste",
        dataUrl: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`,
      });

      expect(text.path).toContain(join(".memoire", "studio", "attachments", "draft"));
      expect(await readFile(text.path ?? "", "utf-8")).toContain("Long pasted research material");
      expect(image.path).toContain(join(".memoire", "studio", "attachments", "studio-session-1"));
      expect(await readFile(image.path ?? "")).toEqual(Buffer.from("png-bytes"));
      expect(await getStudioAttachment(root, image.id)).toMatchObject({
        id: image.id,
        kind: "image",
        name: "screen.png",
        source: "paste",
      });
    } finally {
      resetExecutionPolicyForTests();
      await rm(root, { recursive: true, force: true });
    }
  });
});


describe('attachment persistence authority', () => {
  it.each(['locked', 'missing-source-grant'])('denies source-bearing writes under %s authority', async mode => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-authority-'));
    try {
      configureExecutionPolicy({ projectRoot: root, profile: mode === 'locked' ? 'locked' : 'connected', allow: ['project-write'] });
      await expect(captureStudioAttachment(root, { kind: 'text', name: 'note.txt', mimeType: 'text/plain', source: 'paste', text: 'Private fixture' })).rejects.toMatchObject({ code: 'MEMI_CAPABILITY_DENIED' });
    } finally { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); }
  });
  it.each(['directory', 'index'])('does not follow a symlinked attachment %s', async target => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-symlink-'));
    const outside = await mkdtemp(join(tmpdir(), 'memi-attachment-external-'));
    try {
      configureExecutionPolicy({ projectRoot: root, profile: 'connected', allow: ['project-write', 'source-content-persistence'] });
      const base = join(root, '.memoire', 'studio', 'attachments');
      await mkdir(base, { recursive: true });
      await writeFile(join(outside, 'index.json'), 'External sentinel');
      await symlink(target === 'directory' ? outside : join(outside, 'index.json'), join(base, target === 'directory' ? 'draft' : 'index.json'));
      await expect(captureStudioAttachment(root, { kind: 'text', name: 'note.txt', mimeType: 'text/plain', source: 'paste', text: 'Private fixture' })).rejects.toThrow();
      expect(await readFile(join(outside, 'index.json'), 'utf8')).toBe('External sentinel');
    } finally { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
  });
  it('rejects forged attachment index paths outside its store', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-index-'));
    try {
      const base = join(root, '.memoire', 'studio', 'attachments'); await mkdir(base, { recursive: true });
      await writeFile(join(base, 'index.json'), JSON.stringify([{ id: 'attachment-forged', kind: 'text', name: 'secret', mimeType: 'text/plain', source: 'paste', path: join(root, 'outside.txt') }]));
      expect(await getStudioAttachment(root, 'attachment-forged')).toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
