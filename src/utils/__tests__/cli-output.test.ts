import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { writeCliJson } from '../cli-output.js';

describe('CLI JSON output completion', () => {
  it('awaits the stream callback and preserves the complete JSON and newline', async () => {
    let finish: (() => void) | undefined;
    let bytes = '';
    const stream = new Writable({ write(chunk, _encoding, callback) { bytes += chunk.toString(); finish = callback; } });
    const payload = { value: 'x'.repeat(20000) };
    let complete = false;
    const pending = writeCliJson(payload, 2, stream).then(() => { complete = true; });
    await Promise.resolve();
    expect(complete).toBe(false);
    expect(bytes).toBe(JSON.stringify(payload, null, 2) + '\n');
    finish!();
    await pending;
    expect(complete).toBe(true);
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
  });
  it('rejects a failed output write', async () => {
    const failure = new Error('synthetic output failure');
    const stream = new Writable({ write(_chunk, _encoding, callback) { callback(failure); } });
    await expect(writeCliJson({ ok: true }, undefined, stream)).rejects.toBe(failure);
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
  });
  it('cleans listeners when writing throws synchronously', async () => {
    const stream = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const failure = new Error('synthetic thrown write');
    vi.spyOn(stream, 'write').mockImplementation(() => { throw failure; });
    await expect(writeCliJson({}, undefined, stream)).rejects.toBe(failure);
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
  });
  it('rejects writes to an already closed stream without retaining listeners', async () => {
    const stream = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    await new Promise<void>(resolve => { stream.once('close', resolve); stream.destroy(); });
    await expect(writeCliJson({}, undefined, stream)).rejects.toMatchObject({ code: 'ERR_STREAM_DESTROYED' });
    expect(stream.listenerCount('error')).toBe(0);
    expect(stream.listenerCount('close')).toBe(0);
  });
});
