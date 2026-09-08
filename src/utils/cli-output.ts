import type { Writable } from 'node:stream';

/** Await delivery to the output stream before a short-lived CLI command returns. */
export async function writeCliJson(value: unknown, space?: number, stream: Writable = process.stdout): Promise<void> {
  const output = JSON.stringify(value, null, space) + '\n';
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      stream.removeListener('error', onError);
      stream.removeListener('close', onClose);
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); reject(new Error('CLI output stream closed before write completed')); };
    stream.once('error', onError);
    stream.once('close', onClose);
    try {
      stream.write(output, error => {
        if (error) {
          // Writable emits error after its failed callback; keep observing it.
          // An already closed stream cannot emit another lifecycle event.
          if (stream.closed) cleanup();
          reject(error);
        } else {
          cleanup();
          resolve();
        }
      });
    } catch (error) { cleanup(); reject(error); }
  });
}
