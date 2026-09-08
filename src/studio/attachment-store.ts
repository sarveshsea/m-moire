import { lstat, mkdir } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { readContainedBytes, readContainedSource } from "../security/contained-source.js";
import { getExecutionPolicy } from "../security/execution-policy.js";
import { writeSourceArtifact } from "../security/source-output.js";
import type { StudioAttachment, StudioAttachmentCaptureRequest } from "./types.js";

const MAX_ATTACHMENT_BYTES = 8_000_000;
const MAX_INDEX_BYTES = 10_000_000;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ATTACHMENT_ID = /^attachment-[0-9a-f-]{36}$/;

export async function captureStudioAttachment(projectRoot: string, input: StudioAttachmentCaptureRequest): Promise<StudioAttachment> {
  if (!input || !["text", "image", "file"].includes(input.kind) || !["file", "paste", "drop", "material"].includes(input.source)) {
    throw invalidAttachment("Invalid attachment kind or source");
  }
  const sessionId = normalizeSessionId(input.sessionId);
  const payload = attachmentPayload(input);
  const id = `attachment-${randomUUID()}`;
  const name = sanitizeFileName(typeof input.name === "string" ? input.name : `${input.kind}.txt`);
  const dir = join(attachmentsDir(projectRoot), sessionId ?? "draft");
  const target = join(dir, `${id}-${name}`);
  const policy = getExecutionPolicy();
  policy.assert("source-content-persistence", "capture Studio attachment");
  await policy.assertProjectWrite(target, "capture Studio attachment");
  await ensureAttachmentDirectories(projectRoot, sessionId);
  const previous = await listAttachmentIndex(projectRoot);
  // Validate index authority before writing any source-bearing attachment bytes.
  await policy.assertProjectWrite(attachmentIndexPath(projectRoot), "update Studio attachment index");
  const attachment: StudioAttachment = {
    id, sessionId, kind: input.kind, name,
    mimeType: typeof input.mimeType === "string" ? input.mimeType.slice(0, 120) : "application/octet-stream",
    source: input.source, path: target,
    text: input.kind === "text" ? payload.toString("utf8") : undefined,
    previewUrl: input.kind === "image" ? `/api/attachments/${encodeURIComponent(id)}?raw=1` : undefined,
    size: payload.byteLength, createdAt: new Date().toISOString(),
  };
  const index = `${JSON.stringify([...previous, attachment], null, 2)}\n`;
  if (Buffer.byteLength(index) > MAX_INDEX_BYTES) throw invalidAttachment("Attachment index exceeds byte limit");
  const handle = await policy.openProjectWriteExclusive(target, "capture Studio attachment");
  try { await handle.writeFile(payload); } finally { await handle.close(); }
  await writeSourceArtifact(attachmentIndexPath(projectRoot), index);
  return attachment;
}

export async function getStudioAttachment(projectRoot: string, id: string): Promise<StudioAttachment | null> {
  return (await listAttachmentIndex(projectRoot)).find(attachment => attachment.id === id) ?? null;
}

/** Re-check the opened attachment inode at consumption time; never reopen an index path directly. */
export async function readStudioAttachmentBytes(projectRoot: string, attachment: StudioAttachment): Promise<Buffer> {
  if (!validAttachment(projectRoot, attachment)) throw invalidAttachment("Invalid attachment metadata");
  const result = await readContainedBytes(projectRoot, relative(resolve(projectRoot), attachment.path!).split(sep).join("/"), MAX_ATTACHMENT_BYTES);
  if (!result.ok) throw Object.assign(new Error("Attachment content is unavailable or outside its store"), { statusCode: 403 });
  return result.bytes;
}

function attachmentsDir(projectRoot: string): string {
  return join(resolve(projectRoot), ".memoire", "studio", "attachments");
}
function attachmentIndexPath(projectRoot: string): string { return join(attachmentsDir(projectRoot), "index.json"); }

async function listAttachmentIndex(projectRoot: string): Promise<StudioAttachment[]> {
  const path = attachmentIndexPath(projectRoot);
  try { await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const result = await readContainedSource(projectRoot, relative(resolve(projectRoot), path).split(sep).join("/"), MAX_INDEX_BYTES);
  if (!result.ok) throw Object.assign(new Error("Attachment index is not a contained regular file"), { statusCode: 403 });
  let parsed: unknown;
  try { parsed = JSON.parse(result.content); } catch { throw invalidAttachment("Invalid attachment index JSON"); }
  if (!Array.isArray(parsed)) throw invalidAttachment("Invalid attachment index shape");
  return parsed.filter((value): value is StudioAttachment => validAttachment(projectRoot, value));
}

function validAttachment(projectRoot: string, value: unknown): value is StudioAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as StudioAttachment;
  if (typeof item.id !== "string" || !ATTACHMENT_ID.test(item.id) ||
      typeof item.name !== "string" || item.name !== sanitizeFileName(item.name) ||
      typeof item.path !== "string" || typeof item.mimeType !== "string" ||
      !["text", "image", "file"].includes(item.kind) || !["file", "paste", "drop", "material"].includes(item.source) ||
      !Number.isSafeInteger(item.size) || item.size < 0 || item.size > MAX_ATTACHMENT_BYTES ||
      typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt))) return false;
  let sessionId: string | null;
  try { sessionId = normalizeSessionId(item.sessionId); } catch { return false; }
  return item.path === join(attachmentsDir(projectRoot), sessionId ?? "draft", `${item.id}-${item.name}`);
}

async function ensureAttachmentDirectories(projectRoot: string, sessionId: string | null): Promise<void> {
  let path = resolve(projectRoot);
  for (const part of [".memoire", "studio", "attachments", sessionId ?? "draft"]) {
    path = join(path, part);
    await getExecutionPolicy().assertProjectWrite(path, "create Studio attachment directory");
    try { await mkdir(path, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const metadata = await lstat(path);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw Object.assign(new Error("Attachment directory must not be a symlink"), { statusCode: 403 });
    await getExecutionPolicy().assertProjectWrite(path, "create Studio attachment directory");
  }
}

function normalizeSessionId(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !SESSION_ID.test(value.trim())) throw invalidAttachment("Invalid attachment session ID");
  return value.trim();
}
function attachmentPayload(input: StudioAttachmentCaptureRequest): Buffer {
  if (input.text !== undefined && typeof input.text !== "string") throw invalidAttachment("Invalid attachment text");
  if (input.dataUrl !== undefined && typeof input.dataUrl !== "string") throw invalidAttachment("Invalid attachment data URL");
  if ((input.text?.length ?? 0) > MAX_ATTACHMENT_BYTES || (input.dataUrl?.length ?? 0) > Math.ceil(MAX_ATTACHMENT_BYTES * 4 / 3) + 256) throw invalidAttachment("Attachment exceeds byte limit");
  const payload = input.kind !== "text" && input.dataUrl
    ? Buffer.from(input.dataUrl.replace(/^data:[^,]+,/, ""), "base64")
    : Buffer.from(input.text ?? "", "utf8");
  if (payload.length > MAX_ATTACHMENT_BYTES) throw invalidAttachment("Attachment exceeds byte limit");
  return payload;
}
function sanitizeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|\x00-\x1f\x7f]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 180) || "attachment";
}
function invalidAttachment(message: string): Error { return Object.assign(new Error(message), { statusCode: 400 }); }
