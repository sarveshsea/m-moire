// RFC 4122 v4 UUIDs. Prefer crypto.randomUUID; fall back to getRandomValues.
// Figma plugin sandbox exposes `crypto` on the main thread and in the UI iframe.

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
};

function getCrypto(): CryptoLike | null {
  const g = globalThis as unknown as { crypto?: CryptoLike };
  return g.crypto ?? null;
}

export function uuidv4(): string {
  const c = getCrypto();
  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, "0"));
  return (
    hex.slice(0, 4).join("") +
    "-" +
    hex.slice(4, 6).join("") +
    "-" +
    hex.slice(6, 8).join("") +
    "-" +
    hex.slice(8, 10).join("") +
    "-" +
    hex.slice(10, 16).join("")
  );
}

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: unknown): value is string {
  return typeof value === "string" && UUID_V4_RE.test(value);
}

// Human-readable correlation id that wraps a UUID. Kept short by slicing the
// random segment so log lines stay scannable. Do not use for uniqueness-critical
// keys — use uuidv4() directly for those.
export function correlationId(prefix: string): string {
  const short = uuidv4().replace(/-/g, "").slice(0, 10);
  return `${prefix}-${short}`;
}
