import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
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
      await writeFile(join(base, 'index.json'), JSON.stringify([{ id: 'attachment-00000000-0000-0000-0000-000000000000', sessionId: null, kind: 'text', name: 'secret', mimeType: 'text/plain', source: 'paste', size: 7, createdAt: '2026-09-01T00:00:00Z', path: join(root, 'outside.txt') }]));
      expect(await getStudioAttachment(root, 'attachment-00000000-0000-0000-0000-000000000000')).toBeNull();
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});


describe('attachment input and index validation', () => {
  it.each([42, '../escape', 'path\\escape', 'a/b'])('rejects invalid session identifier %j', async sessionId => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-input-'));
    try {
      configureExecutionPolicy({ projectRoot: root, profile: 'connected', allow: ['project-write', 'source-content-persistence'] });
      await expect(captureStudioAttachment(root, { kind: 'text', name: 'note.txt', mimeType: 'text/plain', source: 'paste', text: 'Fixture', sessionId } as never)).rejects.toMatchObject({ statusCode: 400 });
    } finally { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); }
  });
  it.each([{ kind: 'script' }, { source: 'remote-executable' }, { text: 42 }, { dataUrl: 42 }, { text: 'x'.repeat(8_000_001) }])('rejects malformed or oversized payload %#', async patch => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-input-'));
    try {
      configureExecutionPolicy({ projectRoot: root, profile: 'connected', allow: ['project-write', 'source-content-persistence'] });
      await expect(captureStudioAttachment(root, { kind: 'text', name: 'note.txt', mimeType: 'text/plain', source: 'paste', text: 'Fixture', ...patch } as never)).rejects.toMatchObject({ statusCode: 400 });
    } finally { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); }
  });
  it('does not treat authorization for another project as authority to persist an attachment', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-root-'));
    const other = await mkdtemp(join(tmpdir(), 'memi-attachment-authorized-'));
    try {
      configureExecutionPolicy({ projectRoot: other, profile: 'connected', allow: ['project-write', 'source-content-persistence'] });
      await expect(captureStudioAttachment(root, { kind: 'text', name: 'note.txt', mimeType: 'text/plain', source: 'paste', text: 'Fixture' })).rejects.toMatchObject({ code: 'MEMI_CAPABILITY_DENIED' });
    } finally { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); await rm(other, { recursive: true, force: true }); }
  });
  it.each(['{broken', '{}'])('rejects corrupt existing index %# instead of silently discarding it', async content => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-corrupt-'));
    try {
      const base = join(root, '.memoire', 'studio', 'attachments'); await mkdir(base, { recursive: true });
      await writeFile(join(base, 'index.json'), content);
      await expect(getStudioAttachment(root, 'missing')).rejects.toMatchObject({ statusCode: 400 });
      expect(await readFile(join(base, 'index.json'), 'utf8')).toBe(content);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});


describe('attachment index budget preflight', () => {
  it('does not leave source files when escaping expands valid text beyond the index budget', async () => {
    const root = await mkdtemp(join(tmpdir(), 'memi-attachment-index-budget-'));
    try {
      configureExecutionPolicy({ projectRoot: root, profile: 'connected', allow: ['project-write', 'source-content-persistence'] });
      // Six million newline bytes fit the payload budget but need twelve million JSON bytes.
      await expect(captureStudioAttachment(root, { kind: 'text', name: 'expanded.txt', mimeType: 'text/plain', source: 'paste', text: '\n'.repeat(6_000_000) })).rejects.toMatchObject({ statusCode: 400 });
      expect(await readdir(join(root, '.memoire', 'studio', 'attachments', 'draft'))).toEqual([]);
    } finally { resetExecutionPolicyForTests(); await rm(root, { recursive: true, force: true }); }
  });
});
