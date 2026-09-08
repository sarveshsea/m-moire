import { createHash } from 'node:crypto';
import { z } from 'zod';

const text = z.string().min(1).max(512);
const pathSchema = text.refine(value => !value.includes('\\') && !value.includes(':') && !value.startsWith('/') && !/[\x00-\x1f]/.test(value) && value.split('/').every(part => part !== '..' && part !== '.' && part !== ''), 'Expected a workspace-relative path');
const scalar = z.union([z.string().max(2048), z.number().finite(), z.boolean(), z.null()]);
export const DesignEvidenceSchema = z.object({
  source: z.enum(['figma', 'paper']), documentId: text, nodeId: text,
  revision: text.optional(), capturedAt: z.string().datetime().optional(),
  mappings: z.array(z.object({
    path: pathSchema, exportName: z.string().regex(/^[A-Za-z_$][\w$]*$/).max(128),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    props: z.record(scalar).default({}), tokens: z.array(text).max(100).default([]),
  }).strict()).max(100).default([]),
  properties: z.record(scalar).default({}),
}).strict();
export type DesignEvidence = z.infer<typeof DesignEvidenceSchema>;

/** Accepts a bounded, JSON-shaped harness envelope, never native connector instructions. */
export function normalizeDesignEvidence(input: unknown): DesignEvidence {
  assertPlainData(input);
  const serialized = JSON.stringify(input);
  if (!serialized || Buffer.byteLength(serialized) > 131072) throw new Error('Design evidence exceeds the 128 KiB input budget.');
  const result = DesignEvidenceSchema.safeParse(input);
  if (!result.success) throw new Error('Invalid design evidence envelope; check schema, paths, field limits and source kind.');
  return result.data;
}

function assertPlainData(input: unknown, depth = 0): void {
  if (depth > 12) throw new Error('Design evidence exceeds nesting limit.');
  if (input === null || ['string', 'boolean', 'number'].includes(typeof input)) return;
  if (typeof input !== 'object') throw new Error('Design evidence must be JSON data.');
  const proto: unknown = Object.getPrototypeOf(input);
  if (!Array.isArray(input) && proto !== Object.prototype && proto !== null) throw new Error('Design evidence must contain plain objects.');
  const entries = Object.entries(Object.getOwnPropertyDescriptors(input));
  if (entries.length > 1024) throw new Error('Design evidence exceeds object field limit.');
  for (const [key, descriptor] of entries) {
    if (['__proto__', 'prototype', 'constructor'].includes(key) || !('value' in descriptor)) throw new Error('Unsafe design evidence property.');
    assertPlainData(descriptor.value, depth + 1);
  }
}

export function fingerprint(value: string): string { return createHash('sha256').update(value).digest('hex'); }
